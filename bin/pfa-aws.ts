#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PfaAwsStack } from "../lib/pfa-aws-stack";

const app = new cdk.App();
new PfaAwsStack(app, "PFA-dev", {
  suffix: "dev",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
