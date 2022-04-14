import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { Construct } from "constructs";

interface Props {
  suffix: string;
}

export class NetworkConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }

  public elksClusterVPC = new ec2.Vpc(this, "ECSClusterVPC", {
    cidr: "10.0.0.0/16",
    vpcName: `ecs-cluster-vpc-${this.props.suffix}`,
    natGateways: 1,
    maxAzs: 3,
  });
}
