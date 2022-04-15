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
  kibanaRepo: IRepository;
  discoveryNameSpace: PrivateDnsNamespace;
}

export class KibanaServiceConstruct extends Construct {
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

    this.kibanaTaskDef.addToExecutionRolePolicy(executionRolePolicy);
    this.props.kibanaRepo.grantPull(this.kibanaTaskRole);

    // SECURITY GROUPS
    // TODO sepecify more
    this.kibanaSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      "Open ingress from anywhere"
    );

    // service

    this.kibanaService.targetGroup.configureHealthCheck({
      path: "/",
      enabled: true,
    });
  }
  private kibanaLogging = new ecs.AwsLogDriver({
    streamPrefix: `Kibana-logs-${this.props.suffix}`,
  });

  private kibanaTaskRole = new iam.Role(this, `ecs-taskRole`, {
    assumedBy: new iam.ServicePrincipal(ServicePrincipals.ECS_TASKS),
  });

  private kibanaTaskDef = new ecs.FargateTaskDefinition(this, "ecs-taskdef", {
    taskRole: this.kibanaTaskRole,
    cpu: 2048,
    memoryLimitMiB: 4096,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    },
  });

  private kibanaContainer = this.kibanaTaskDef.addContainer("KibanaContainer", {
    image: ecs.ContainerImage.fromRegistry(this.props.kibanaRepo.repositoryUri),
    logging: this.kibanaLogging,
    portMappings: [{ containerPort: 5601, protocol: ecs.Protocol.TCP }],
    environment: {
      KIBANA_SYSTEM_PASSWORD: "changeme",
    },
    essential: true,
  });

  private kibanaSecurityGroup = new ec2.SecurityGroup(
    this,
    `Kibana-security-group`,
    {
      vpc: this.props.elkVPC,
      allowAllOutbound: true,
      description: "kibana Security Group",
    }
  );

  // _cat/health
  // public kibanaService = new ecs.FargateService(this, "KibanaService", {
  //   cluster: this.props.cluster,
  //   // healthCheckGracePeriod: Duration.days(1),
  //   taskDefinition: this.kibanaTaskDef,
  //   assignPublicIp: true,
  //   securityGroups: [this.kibanaSecurityGroup],
  //   desiredCount: 1,
  //   cloudMapOptions: {
  //     name: "kibana",
  //     cloudMapNamespace: this.props.discoveryNameSpace,
  //     dnsRecordType: DnsRecordType.A,
  //   },
  // });

  public kibanaService = new ecs_patterns.ApplicationLoadBalancedFargateService(
    this,
    "KibanaService",
    {
      serviceName: "Kibana-ALB",
      cluster: this.props.cluster,
      taskDefinition: this.kibanaTaskDef,
      assignPublicIp: true,
      publicLoadBalancer: true,
      desiredCount: 1,
      cloudMapOptions: {
        name: "kibana",
        cloudMapNamespace: this.props.discoveryNameSpace,
        dnsRecordType: DnsRecordType.A,
      },
      listenerPort: 80,
    }
  );
}
