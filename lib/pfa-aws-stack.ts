import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface Props extends StackProps {
  suffix: string;
}

export class PfaAwsStack extends Stack {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id, props);
  }
}
