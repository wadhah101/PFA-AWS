import { Construct } from "constructs";

interface Props {
  suffix: string;
}

// TODO questions : find where elastic tools store their app data
export class ClusterConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
  }
}
