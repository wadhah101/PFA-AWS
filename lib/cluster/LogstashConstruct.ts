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
import { IVpc } from "aws-cdk-lib/aws-ec2";
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

    this.logstashService.connections.allowToAnyIpv4(ec2.Port.allTraffic());
    this.logstashService.connections.allowFromAnyIpv4(ec2.Port.allTraffic());
  }
  private logstashLogging = new ecs.AwsLogDriver({
    streamPrefix: `logstash-logs-${this.props.suffix}`,
  });

  private logstashTaskRole = new iam.Role(this, `ecs-taskRole`, {
    assumedBy: new iam.ServicePrincipal(ServicePrincipals.ECS_TASKS),
  });

  private logstashTaskDef = new ecs.FargateTaskDefinition(this, "ecs-taskdef", {
    taskRole: this.logstashTaskRole,
    cpu: 1024,
    memoryLimitMiB: 4096,
    volumes: [
      {
        name: "data",
        efsVolumeConfiguration: {
          fileSystemId: this.props.elkVolume.fileSystemId,
          rootDirectory: "/",
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

  public logstashService = new ecs.FargateService(this, "Service", {
    cluster: this.props.cluster,
    taskDefinition: this.logstashTaskDef,
    assignPublicIp: true,
    circuitBreaker: { rollback: true },
    serviceName: "logstash",
    cloudMapOptions: {
      name: "logstash",
      cloudMapNamespace: this.props.discoveryNameSpace,
      dnsRecordType: DnsRecordType.A,
    },
  });
}
