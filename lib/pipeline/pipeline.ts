import { StackProps, aws_codecommit as codecommit } from "aws-cdk-lib";
import { Construct } from "constructs";

interface Props extends StackProps {
  suffix: string;
}

export class PipelineConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }

  private elkCodeCommit = codecommit.Repository.fromRepositoryArn(
    this,
    "elkRepo",
    "arn:aws:codecommit:eu-west-3:316616769018:PFA-ELK"
  );
}