import {
  aws_ecs as ecs,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_servicediscovery as servicediscovery,
} from "aws-cdk-lib";
import { IVpc, Port } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { FileSystem } from "aws-cdk-lib/aws-efs";
import { NamespaceType } from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";
import { ElasticServiceConstruct } from "./ElasticServiceConstruct";
import { KibanaServiceConstruct } from "./kibanaServiceConstruct";
import { LogstashServiceConstruct } from "./LogstashConstruct";

interface Props {
  suffix: string;
  elasticRepo: IRepository;
  logstashRepo: IRepository;
  kibanaRepo: IRepository;
  elkVPC: IVpc;
  elkVolume: FileSystem;
}

const desiredTasks = 1;

export class ClusterConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);

    this.logStashService.logstashService.connections.allowTo(
      this.elasticServiceConstruct.elasticService,
      Port.allTraffic()
    );

    this.logStashService.logstashService.connections.allowFrom(
      this.elasticServiceConstruct.elasticService,
      Port.allTraffic()
    );
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
      elkVolume: this.props.elkVolume,
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

  logStashService = new LogstashServiceConstruct(this, "logstash", {
    cluster: this.elkCluster,
    discoveryNameSpace: this.elkClusterNameSpace,
    elkVPC: this.props.elkVPC,
    elkVolume: this.props.elkVolume,
    logstashRepo: this.props.logstashRepo,
    suffix: this.props.suffix,
  });
}
