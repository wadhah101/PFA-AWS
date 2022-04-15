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

  network = new NetworkConstruct(this, "Network", {
    suffix: this.props.suffix,
  });

  storage = new StorageConstruct(this, "Storage", {
    suffix: this.props.suffix,
    efsVPC: this.network.elksClusterVPC,
  });

  pipeline = new PipelineConstruct(this, "Pipeline", {
    suffix: this.props.suffix,
    elasticRepo: this.storage.elasticRepo,
    kibanaRepo: this.storage.kibanaRepo,
    logstashRepo: this.storage.logstashRepo,
    efsVPC: this.network.elksClusterVPC,
    configEFS: this.storage.fileSystem,
  });

  cluster = new ClusterConstruct(this, "Cluster", {
    suffix: this.props.suffix,
    elasticRepo: this.storage.elasticRepo,
    elkVPC: this.network.elksClusterVPC,
    kibanaRepo: this.storage.kibanaRepo,
    logstashRepo: this.storage.logstashRepo,
  });
}
