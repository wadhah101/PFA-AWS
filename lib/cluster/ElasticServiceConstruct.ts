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

interface Props {
  suffix: string;
  cluster: ICluster;
  elkVPC: IVpc;
  elasticRepo: IRepository;
  discoveryNameSpace: PrivateDnsNamespace;
}

export class ElasticServiceConstruct extends Construct {
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

    // SECURITY GROUPS
    // TODO sepecify more
    this.elasticSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      "Open ingress from anywhere"
    );
  }
  private elasticLogging = new ecs.AwsLogDriver({
    streamPrefix: `elastic-logs-${this.props.suffix}`,
  });

  private elasticTaskRole = new iam.Role(this, `ecs-taskRole`, {
    assumedBy: new iam.ServicePrincipal(ServicePrincipals.ECS_TASKS),
  });

  private elasticTaskDef = new ecs.FargateTaskDefinition(this, "ecs-taskdef", {
    taskRole: this.elasticTaskRole,
    cpu: 2048,
    memoryLimitMiB: 4096,
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

  private elasticSecurityGroup = new ec2.SecurityGroup(
    this,
    `elastic-security-group`,
    {
      vpc: this.props.elkVPC,
      allowAllOutbound: true,
      description: "CDK Security Group",
    }
  );

  // _cat/health
  public elasticService = new ecs.FargateService(this, "Service", {
    cluster: this.props.cluster,
    // healthCheckGracePeriod: Duration.days(1),
    taskDefinition: this.elasticTaskDef,
    assignPublicIp: true,
    serviceName: "elasticsearch",
    securityGroups: [this.elasticSecurityGroup],
    // desiredCount: 0,
    cloudMapOptions: {
      name: "elastic",
      cloudMapNamespace: this.props.discoveryNameSpace,
      dnsRecordType: DnsRecordType.A,
    },
  });
}
