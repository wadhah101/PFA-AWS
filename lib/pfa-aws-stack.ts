import { Stack, StackProps, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ClusterConstruct } from "./cluster/ClusterConsturct";
import { NetworkConstruct } from "./network/NetworkConstruct";
import { PipelineConstruct } from "./pipeline/pipeline";
import { StorageConstruct } from "./storage/StorageConstruct";

interface Props extends StackProps {
  suffix: string;
}

export class PfaAwsStack extends Stack {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id, props);
  }

  storage = new StorageConstruct(this, "Storage", {
    suffix: this.props.suffix,
  });

  pipeline = new PipelineConstruct(this, "Pipeline", {
    suffix: this.props.suffix,
  });

  network = new NetworkConstruct(this, "Network", {
    suffix: this.props.suffix,
  });

  cluster = new ClusterConstruct(this, "Cluster", {
    suffix: this.props.suffix,
  });
}
