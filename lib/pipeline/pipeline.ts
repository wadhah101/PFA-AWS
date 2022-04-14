import { Stack, StackProps, aws_s3 as s3, aws_ecr as ecr } from "aws-cdk-lib";
import { Construct } from "constructs";

interface Props extends StackProps {
  suffix: string;
}

export class PipelineConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }
}
