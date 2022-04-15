import {
  StackProps,
  aws_codecommit as codecommit,
  aws_codepipeline as codepipeline,
  aws_codebuild as codebuild,
  aws_codepipeline_actions as actions,
  FileSystem,
  aws_efs,
} from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { containerCodeBuild } from "./buildspecECR";

const ELASTIC_VERSION = "8.1.2";

interface Props extends StackProps {
  suffix: string;
  efsVPC: IVpc;
  configEFS: aws_efs.FileSystem;
  kibanaRepo: IRepository;
  elasticRepo: IRepository;
  logstashRepo: IRepository;
}

export class PipelineConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
    this.props.elasticRepo.grantPullPush(this.elasticCodeBuildProject);
    this.props.kibanaRepo.grantPullPush(this.kibanaCodeBuildProject);
  }

  private elkCodeCommit = codecommit.Repository.fromRepositoryArn(
    this,
    "elkRepo",
    "arn:aws:codecommit:eu-west-3:316616769018:PFA-ELK"
  );

  private sourceActions = new actions.CodeCommitSourceAction({
    repository: this.elkCodeCommit,
    actionName: "sourceFromCodeCommit",
    output: new codepipeline.Artifact("Source"),
    branch: "master",
  });

  elasticCodeBuildProject = new codebuild.PipelineProject(
    this,
    "CodeBuildProject",
    {
      environment: {
        privileged: true,
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: containerCodeBuild("elasticsearch"),
    }
  );

  kibanaCodeBuildProject = new codebuild.PipelineProject(
    this,
    "KibanaCodeBuildProject",
    {
      environment: {
        privileged: true,
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: containerCodeBuild("kibana"),
    }
  );

  private elasticCodeBuildAction = new actions.CodeBuildAction({
    actionName: "BuildElasticContainer",
    runOrder: 1,
    project: this.elasticCodeBuildProject,
    input: new codepipeline.Artifact("Source"),
    outputs: [new codepipeline.Artifact("BuildElastic")],
    environmentVariables: {
      ECR_REPO: {
        value: this.props.elasticRepo.repositoryUri,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
      IMAGE_NAME: {
        value: this.props.elasticRepo.repositoryName,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
      ELASTIC_VERSION: {
        value: ELASTIC_VERSION,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },

      SERVICE_CONTAINER_NAME: {
        value: "todo", // this.container.containerName,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
    },
  });

  private kibanaCodeBuildAction = new actions.CodeBuildAction({
    actionName: "BuildKibanaContainer",
    runOrder: 1,
    project: this.kibanaCodeBuildProject,
    input: new codepipeline.Artifact("Source"),
    outputs: [new codepipeline.Artifact("BuildKibana")],
    environmentVariables: {
      // TODO use proper service discovery name
      ELASTIC_SEARCH_HOST: {
        value: "elastic.elk.dev",
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
      ECR_REPO: {
        value: this.props.kibanaRepo.repositoryUri,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
      IMAGE_NAME: {
        value: this.props.kibanaRepo.repositoryName,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
      ELASTIC_VERSION: {
        value: ELASTIC_VERSION,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },

      SERVICE_CONTAINER_NAME: {
        value: "todo", // this.container.containerName,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
    },
  });

  private buildImagePipeline = new codepipeline.Pipeline(this, "BuildDocker", {
    pipelineName: `build-elk-docker-${this.props.suffix}`,
    stages: [
      { stageName: "source", actions: [this.sourceActions] },
      {
        stageName: "build",
        actions: [this.elasticCodeBuildAction, this.kibanaCodeBuildAction],
      },
    ],
  });
}
