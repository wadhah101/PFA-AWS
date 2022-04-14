import { Stack, StackProps, aws_s3 as s3, aws_ecr as ecr } from "aws-cdk-lib";
import { Construct } from "constructs";

interface Props extends StackProps {
  suffix: string;
}

export class StorageConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }

  kibanaRepo = new ecr.Repository(this, "kibanaRepo", {
    repositoryName: `kibana-pfa-${this.props.suffix}`,
  });
  elasticRepo = new ecr.Repository(this, "elasticRepo", {
    repositoryName: `elastic-pfa-${this.props.suffix}`,
  });
  logstashRepo = new ecr.Repository(this, "logstashRepo", {
    repositoryName: `logstash-pfa-${this.props.suffix}`,
  });
}
