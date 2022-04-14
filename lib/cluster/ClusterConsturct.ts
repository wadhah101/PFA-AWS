import { Construct } from "constructs";

interface Props {
  suffix: string;
}

export class ClusterConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }
}
