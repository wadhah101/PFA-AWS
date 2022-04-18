import { ICluster } from "aws-cdk-lib/aws-ecs";
import { ServicePrincipals } from "cdk-constants";
import { Construct } from "constructs";
import {
  aws_iam as iam,
  aws_ecs as ecs,
  aws_ec2 as ec2,
  aws_servicediscovery as servicediscovery,
  aws_ecs_patterns as ecs_patterns,
  Duration,
} from "aws-cdk-lib";
import { IVpc, Port } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  DnsRecordType,
  PrivateDnsNamespace,
} from "aws-cdk-lib/aws-servicediscovery";
import { FileSystem } from "aws-cdk-lib/aws-efs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

interface Props {
  suffix: string;
  cluster: ICluster;
  elkVPC: IVpc;
  elasticRepo: IRepository;
  discoveryNameSpace: PrivateDnsNamespace;
  elkVolume: FileSystem;
}

export class ElasticServiceConstruct extends Construct {
  // THIS IS SO IMPORTANT
  private elasticAccessPoint = this.props.elkVolume.addAccessPoint(
    "ElasticSearchDataAccessPoint",
    {
      path: "/elastic",
      posixUser: {
        uid: "1000",
        gid: "1000",
      },
      createAcl: {
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "755",
      },
    }
  );

  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);

    const executionRolePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
    });

    this.elasticTaskDef.addToExecutionRolePolicy(executionRolePolicy);
    this.props.elasticRepo.grantPull(this.elasticTaskRole);

    // IMPROVEMENT limit filesystem access to folder
    this.props.elkVolume.grant(this.elasticTaskRole, "*");

    this.props.elkVolume.connections.allowTo(
      this.elasticService,
      Port.tcp(2049)
    );
    this.props.elkVolume.connections.allowFrom(
      this.elasticService,
      Port.tcp(2049)
    );

    this.elasticService.connections.allowFrom(
      this.props.elkVolume,
      Port.tcp(2049)
    );
    this.elasticService.connections.allowTo(
      this.props.elkVolume,
      Port.tcp(2049)
    );

    // TODO remove in future and allow just kibana and logstash
    this.elasticService.connections.allowToAnyIpv4(ec2.Port.allTraffic());
    this.elasticService.connections.allowFromAnyIpv4(ec2.Port.allTraffic());

    // CONTAINER CONFIG
    this.elasticContainer.addMountPoints({
      containerPath: "/usr/share/elasticsearch/data",
      readOnly: false,
      sourceVolume: "elasticData",
    });
  }
  private elasticLogging = new ecs.AwsLogDriver({
    streamPrefix: `elastic-logs-${this.props.suffix}`,
    logRetention: RetentionDays.THREE_DAYS,
  });

  private elasticTaskRole = new iam.Role(this, `ecs-taskRole`, {
    assumedBy: new iam.ServicePrincipal(ServicePrincipals.ECS_TASKS),
  });

  private elasticTaskDef = new ecs.FargateTaskDefinition(this, "ecs-taskef", {
    taskRole: this.elasticTaskRole,
    cpu: 1024,
    memoryLimitMiB: 4096,
    volumes: [
      {
        name: "elasticData",
        efsVolumeConfiguration: {
          fileSystemId: this.props.elkVolume.fileSystemId,
          transitEncryption: "ENABLED",
          authorizationConfig: {
            accessPointId: this.elasticAccessPoint.accessPointId,
            iam: "ENABLED",
          },
        },
      },
    ],
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    },
  });

  private elasticContainer = this.elasticTaskDef.addContainer(
    "ElasticContainer",
    {
      image: ecs.ContainerImage.fromRegistry(
        this.props.elasticRepo.repositoryUri
      ),
      logging: this.elasticLogging,
      portMappings: [
        { containerPort: 9200, protocol: ecs.Protocol.TCP },
        { containerPort: 9300, protocol: ecs.Protocol.TCP },
      ],
      environment: {
        ELASTIC_PASSWORD: "changeme",
        "discovery.type": "single-node",
      },
      essential: true,
    }
  );

  public elasticService = new ecs.FargateService(this, "Service", {
    cluster: this.props.cluster,
    taskDefinition: this.elasticTaskDef,
    assignPublicIp: true,
    serviceName: "elasticsearch",
    cloudMapOptions: {
      name: "elastic",
      cloudMapNamespace: this.props.discoveryNameSpace,
      dnsRecordType: DnsRecordType.A,
    },
  });
}
