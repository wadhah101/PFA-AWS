import {
  aws_ecs as ecs,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_servicediscovery as servicediscovery,
} from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { ElasticServiceConstruct } from "./ElasticServiceConstruct";
import { KibanaServiceConstruct } from "./kibanaServiceConstruct";

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

  kibanaService = new KibanaServiceConstruct(this, "kibanservice", {
    cluster: this.elkCluster,
    discoveryNameSpace: this.elkClusterNameSpace,
    elkVPC: this.props.elkVPC,
    kibanaRepo: this.props.kibanaRepo,
    suffix: this.props.suffix,
  });
}
