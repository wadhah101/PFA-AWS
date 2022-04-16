
import cdk = require("@aws-cdk/core");
import { Vpc, Port } from "@aws-cdk/aws-ec2";
import {
  Cluster,
  ContainerImage,
  AwsLogDriver,
  FargatePlatformVersion,
  NetworkMode,
  CfnService,
} from "@aws-cdk/aws-ecs";
import { Certificate } from "@aws-cdk/aws-certificatemanager";
import { ApplicationLoadBalancedFargateService } from "@aws-cdk/aws-ecs-patterns";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";
import { HostedZone } from "@aws-cdk/aws-route53";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "@aws-cdk/custom-resources";
import {
  FileSystem,
  LifecyclePolicy,
  PerformanceMode,
  ThroughputMode,
} from "@aws-cdk/aws-efs";

export class FargateEfsStack extends cdk.Stack {
  public serviceUrl: string;
  constructor(
    scope: cdk.App,
    id: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(...);
    const cluster = Cluster.fromClusterAttributes(...);

    const hostedZone = HostedZone.fromLookup(...);

    const certificateArn = cdk.Fn.importValue("...");

    const certificate = Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn
    );

    const containerImage = "..."; // For example something from a registry

    // Create a public ALB Fargate Service, with a task definition, which
    // we'll change in later steps.
    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      "FargateService",
      {
        serviceName: id,
        cluster,
        certificate,
        // need platform version 1.4.0 to mount EFS volumes
        platformVersion: FargatePlatformVersion.VERSION1_4,
        publicLoadBalancer: true,
        domainName: "...",
        domainZone: hostedZone,
        taskImageOptions: {
          image: ContainerImage.fromRegistry(containerImage),
          family: id,
          containerName: "app",
          containerPort: 9999,
          logDriver: new AwsLogDriver({
            streamPrefix: "app",
            logGroup: new LogGroup(this, "LogGroup", {
              logGroupName: `/app/${id}`,
              retention: RetentionDays.TWO_MONTHS,
            }),
          }),
        },
      }
    );

    // Create the file system
    const fileSystem = new FileSystem(this, "AppEFS", {
      vpc,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING,
    });

    const volumeConfig = {
      name: "efs-volume",
      // this is the main config
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    };

    const mountPoints = [
      {
        containerPath: "/root",
        sourceVolume: volumeConfig.name,
        readOnly: false,
      },
    ];

    /*
      This object is the final task definition, which includes the
      EFS volume configurations. This definiton is created as a Custom Resource through
      the aws-sdk. This is a stop-gap measure that will be replaced when this
      capability is fully supported in CloudFormation and CDK.
    */
    const customTaskDefinitionJson = {
      containerDefinitions: [
        {
          essential: true,
          image: containerImage,
          logConfiguration: {
            logDriver:
              fargateService.taskDefinition.defaultContainer?.logDriverConfig
                ?.logDriver,
            options:
              fargateService.taskDefinition.defaultContainer?.logDriverConfig
                ?.options,
          },
          memory: 8192,
          mountPoints,
          name: fargateService.taskDefinition.defaultContainer?.containerName,
          portMappings: [
            {
              containerPort: 9999,
              protocol: "tcp",
            },
          ],
        },
      ],
      cpu: "2048",
      executionRoleArn: fargateService.taskDefinition.executionRole?.roleArn,
      family: fargateService.taskDefinition.family,
      memory: "8192",
      networkMode: NetworkMode.AWS_VPC,
      requiresCompatibilities: ["FARGATE"],
      tags: [
      ],
      taskRoleArn: fargateService.taskDefinition.taskRole.roleArn,
      volumes: [volumeConfig],
    };

    const createOrUpdateCustomTaskDefinition = {
      service: "ECS",
      action: "registerTaskDefinition",
      outputPath: "taskDefinition.taskDefinitionArn",
      parameters: customTaskDefinitionJson,
      physicalResourceId: PhysicalResourceId.fromResponse(
        "taskDefinition.taskDefinitionArn"
      ),
    };
    const customTaskDefinition = new AwsCustomResource(
      fargateService,
      "CustomFargateTaskDefinition",
      {
        onCreate: createOrUpdateCustomTaskDefinition,
        onUpdate: createOrUpdateCustomTaskDefinition,
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );
    fargateService.taskDefinition.executionRole?.grantPassRole(
      customTaskDefinition.grantPrincipal
    );
    fargateService.taskDefinition.taskRole.grantPassRole(
      customTaskDefinition.grantPrincipal
    );

    // Need to add permissions to and from the file system to the target,
    // or else the task will timeout trying to mount the file system.
    fargateService.service.connections.allowFrom(fileSystem, Port.tcp(2049));
    fargateService.service.connections.allowTo(fileSystem, Port.tcp(2049));

    /*
      After creating the task definition custom resouce, update the 
      fargate service to use the new task definition revision above.
      This will get around the current limitation of not being able to create
      ecs services with task definition arns.
    */
    (fargateService.service.node.tryFindChild(
      "Service"
    ) as CfnService)?.addPropertyOverride(
      "TaskDefinition",
      customTaskDefinition.getResponseField("taskDefinition.taskDefinitionArn")
    );

  }
}
