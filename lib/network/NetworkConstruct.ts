import {
  aws_ec2 as ec2,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
} from "aws-cdk-lib";
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

  private cloudfrontELK = new cloudfront.Distribution(this, "cloudfrontELK", {
    comment:
      "The distribution that bill used with ELK stack to collect logs and connect",
    defaultBehavior: {
      origin: new origins.HttpOrigin("www.facebook.com"),
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    },
  });
}
