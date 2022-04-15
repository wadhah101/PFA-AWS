import {
  aws_ecs as ecs,
  aws_servicediscovery as servicediscovery,
} from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { ElasticServiceConstruct } from "./ElasticServiceConstruct";

interface Props {
  suffix: string;
  elasticRepo: IRepository;
  logstashRepo: IRepository;
  kibanaRepo: IRepository;
  elkVPC: IVpc;
}

const desiredTasks = 1;

export class ClusterConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }

  elkCluster = new ecs.Cluster(this, "ecs-cluster", {
    clusterName: `elk-cluster-${this.props.suffix}`,
    vpc: this.props.elkVPC,
  });

  elkClusterNameSpace = new servicediscovery.PrivateDnsNamespace(
    this,
    "ElkNamespacee",
    {
      name: `elk.${this.props.suffix}`,
      vpc: this.props.elkVPC,
      description: "Private DnsNamespace for my Microservices",
    }
  );

  elasticServiceConstruct = new ElasticServiceConstruct(
    this,
    "elasticService",
    {
      cluster: this.elkCluster,
      elasticRepo: this.props.elasticRepo,
      elkVPC: this.props.elkVPC,
      suffix: this.props.suffix,
      discoveryNameSpace: this.elkClusterNameSpace,
    }
  );
}
