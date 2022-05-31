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
  aws_certificatemanager,
  aws_route53,
} from "aws-cdk-lib";
import { IVpc, Port } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  DnsRecordType,
  PrivateDnsNamespace,
} from "aws-cdk-lib/aws-servicediscovery";
import { FileSystem } from "aws-cdk-lib/aws-efs";

interface Props {
  suffix: string;
  cluster: ICluster;
  elkVPC: IVpc;
  logstashRepo: IRepository;
  discoveryNameSpace: PrivateDnsNamespace;
  elkVolume: FileSystem;
}

export class LogstashServiceConstruct extends Construct {
  // THIS IS SO IMPORTANT
  private logstashAccessPoint = this.props.elkVolume.addAccessPoint(
    "LogstashSearchDataAccessPoint",
    {
      path: "/logstash",
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

    this.logstashTaskDef.addToExecutionRolePolicy(executionRolePolicy);
    this.props.logstashRepo.grantPull(this.logstashTaskRole);

    // IMPROVEMENT limit filesystem access to folder
    this.props.elkVolume.grant(this.logstashTaskRole, "*");

    this.props.elkVolume.connections.allowTo(
      this.logstashService,
      Port.tcp(2049)
    );
    this.props.elkVolume.connections.allowFrom(
      this.logstashService,
      Port.tcp(2049)
    );

    this.logstashService.connections.allowFrom(
      this.props.elkVolume,
      Port.tcp(2049)
    );
    this.logstashService.connections.allowTo(
      this.props.elkVolume,
      Port.tcp(2049)
    );

    // CONTAINER CONFIG
    // this.logstashContainer.addMountPoints({
    //   containerPath: "/usr/share/logstash/pipeline",
    //   readOnly: false,
    //   sourceVolume: "logstashPipelines",
    // });

    // TODO remove debug only
    this.logstashService.connections.allowToAnyIpv4(ec2.Port.allTraffic());
    this.logstashService.connections.allowFromAnyIpv4(ec2.Port.allTraffic());
  }
  private logstashLogging = new ecs.AwsLogDriver({
    streamPrefix: `logstash-logs-${this.props.suffix}`,
  });

  private logstashTaskRole = new iam.Role(this, `ecs-taskRole`, {
    assumedBy: new iam.ServicePrincipal(ServicePrincipals.ECS_TASKS),
  });

  private logstashTaskDef = new ecs.FargateTaskDefinition(this, "ecs-taskDef", {
    taskRole: this.logstashTaskRole,
    cpu: 1024,
    memoryLimitMiB: 4096,
    volumes: [
      {
        name: "logstashPipelines",
        efsVolumeConfiguration: {
          fileSystemId: this.props.elkVolume.fileSystemId,
          transitEncryption: "ENABLED",
          authorizationConfig: {
            accessPointId: this.logstashAccessPoint.accessPointId,
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

  private logstashContainer = this.logstashTaskDef.addContainer(
    "logstashContainer",
    {
      image: ecs.ContainerImage.fromRegistry(
        this.props.logstashRepo.repositoryUri
      ),
      logging: this.logstashLogging,
      portMappings: [
        { containerPort: 5044, protocol: ecs.Protocol.TCP },
        { containerPort: 5000, protocol: ecs.Protocol.TCP },
        { containerPort: 5000, protocol: ecs.Protocol.UDP },
        { containerPort: 9600, protocol: ecs.Protocol.TCP },
      ],
      environment: {
        LOGSTASH_PASSWORD: "changeme",
        ELASTICSEARCH_HOST: `elastic.${this.props.discoveryNameSpace.namespaceName}:9200`,
      },
      essential: true,
    }
  );

  private hostedZone = new aws_route53.PublicHostedZone(this, "HostedZone", {
    zoneName: "logstash.pfasoc.online",
  });

  public logstashServiceALB =
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, "Service", {
      domainZone: this.hostedZone,
      domainName: "logstash.pfasoc.online",
      cluster: this.props.cluster,
      taskDefinition: this.logstashTaskDef,
      openListener: true,
      assignPublicIp: true,
      circuitBreaker: { rollback: true },
      serviceName: "logstash",
      cloudMapOptions: {
        name: "logstash",
        cloudMapNamespace: this.props.discoveryNameSpace,
        dnsRecordType: DnsRecordType.A,
      },

      publicLoadBalancer: true,
    });

  public logstashService = this.logstashServiceALB.service;
}
