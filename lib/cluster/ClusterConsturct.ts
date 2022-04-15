import {
  aws_iam as iam,
  aws_ecs as ecs,
  aws_ecs_patterns as ecs_patterns,
} from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { ServicePrincipals } from "cdk-constants";
import { Construct } from "constructs";

interface Props {
  suffix: string;
  elasticRepo: IRepository;
  logstashRepo: IRepository;
  kibanaRepo: IRepository;
  elkVPC: IVpc;
}

export class ClusterConstruct extends Construct {
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
  }

  elkCluster = new ecs.Cluster(this, "ecs-cluster", {
    clusterName: `elk-cluster-${this.props.suffix}`,
    vpc: this.props.elkVPC,
  });

  elasticLogging = new ecs.AwsLogDriver({
    streamPrefix: `elastic-logs-${this.props.suffix}`,
  });

  elasticTaskRole = new iam.Role(this, `ecs-taskRole`, {
    assumedBy: new iam.ServicePrincipal(ServicePrincipals.ECS_TASKS),
  });

  elasticTaskDef = new ecs.FargateTaskDefinition(this, "ecs-taskdef", {
    taskRole: this.elasticTaskRole,
    cpu: 2048,
    memoryLimitMiB: 4096,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    },
  });

  elasticContainer = this.elasticTaskDef.addContainer("ElasticContainer", {
    image: ecs.ContainerImage.fromRegistry(
      this.props.elasticRepo.repositoryUri
    ),
    logging: this.elasticLogging,
    portMappings: [
      { containerPort: 9200, protocol: ecs.Protocol.TCP },
      { containerPort: 9300, protocol: ecs.Protocol.TCP },
    ],
    environment: {
      ES_JAVA_OPTS: "-Xmx256m -Xms256m",
      ELASTIC_PASSWORD: "changeme",
      "discovery.type": "single-node",
    },
    essential: true,
  });

  // TODO remove the alb
  elasticService = new ecs_patterns.ApplicationLoadBalancedFargateService(
    this,
    "BackendService",
    {
      serviceName: "ALB-BackendService",
      cluster: this.elkCluster,
      taskDefinition: this.elasticTaskDef,
      // TODO hide elastic in private subnet
      assignPublicIp: true,
      publicLoadBalancer: true,
      desiredCount: 1,
      listenerPort: 9200,
    }
  );
}
