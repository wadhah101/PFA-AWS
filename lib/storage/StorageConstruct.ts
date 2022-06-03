import {
  Stack,
  StackProps,
  aws_ecr as ecr,
  aws_efs as efs,
  aws_s3 as s3,
  RemovalPolicy,
} from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { ThroughputMode } from "aws-cdk-lib/aws-efs";
import { Construct } from "constructs";

interface Props extends StackProps {
  suffix: string;
  efsVPC: IVpc;
}

export class StorageConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }

  public kibanaRepo = new ecr.Repository(this, "kibanaRepo", {
    repositoryName: `kibana-pfa-${this.props.suffix}`,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  public elasticRepo = new ecr.Repository(this, "elasticRepo", {
    repositoryName: `elastic-pfa-${this.props.suffix}`,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  public logstashRepo = new ecr.Repository(this, "logstashRepo", {
    repositoryName: `logstash-pfa-${this.props.suffix}`,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  public wazuhRepo = new ecr.Repository(this, "wazuhRepo", {
    repositoryName: `wazuh-pfa-${this.props.suffix}`,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  public fileSystem = new efs.FileSystem(this, "MyEfsFileSystemO", {
    fileSystemName: `elk-filesystem-${this.props.suffix}-t`,
    removalPolicy: RemovalPolicy.DESTROY,
    vpc: this.props.efsVPC,
    performanceMode: efs.PerformanceMode.GENERAL_PURPOSE, // default
    outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS, // files are not transitioned back from (infrequent access) IA to primary storage by default
  });

  public logstashArchiveBucket = new s3.Bucket(this, "logstashArchive", {
    bucketName: `logstash-arhcive-bucket-${this.props.suffix}`,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
  });
}
