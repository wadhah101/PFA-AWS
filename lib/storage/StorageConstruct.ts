import {
  Stack,
  StackProps,
  aws_ecr as ecr,
  aws_efs as efs,
  aws_ec2 as ec2,
  RemovalPolicy,
} from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
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
  });
  public elasticRepo = new ecr.Repository(this, "elasticRepo", {
    repositoryName: `elastic-pfa-${this.props.suffix}`,
  });
  public logstashRepo = new ecr.Repository(this, "logstashRepo", {
    repositoryName: `logstash-pfa-${this.props.suffix}`,
  });

  public fileSystem = new efs.FileSystem(this, "MyEfsFileSystem", {
    fileSystemName: `elk-filesystem-${this.props.suffix}`,
    removalPolicy: RemovalPolicy.DESTROY,
    vpc: this.props.efsVPC,
    performanceMode: efs.PerformanceMode.GENERAL_PURPOSE, // default
    outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS, // files are not transitioned back from (infrequent access) IA to primary storage by default
  });
}
