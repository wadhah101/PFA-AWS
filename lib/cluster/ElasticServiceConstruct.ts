import { ICluster } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

interface Props {
  suffix: string;
  cluster: ICluster;
}

export class ElasticServiceConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }
}
