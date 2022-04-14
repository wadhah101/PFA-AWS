import {
  StackProps,
  aws_codecommit as codecommit,
  aws_codepipeline as codepipeline,
  aws_codebuild as codebuild,
  aws_codepipeline_actions as actions,
} from "aws-cdk-lib";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

interface Props extends StackProps {
  suffix: string;
  kibanaRepo: IRepository;
  elasticRepo: IRepository;
  logstashRepo: IRepository;
}

// TODO pipeline to copy config to efs on push and restart the cluster
// TODO build docker images on pipeline and upload to ecr
export class PipelineConstruct extends Construct {
  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);
    this.props.elasticRepo.grantPullPush(this.CodeBuildProject);
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

  CodeBuildProject = new codebuild.PipelineProject(this, "CodeBuildProject", {
    environment: {
      privileged: true,
      buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      computeType: codebuild.ComputeType.LARGE,
    },
    buildSpec: codebuild.BuildSpec.fromObject({
      version: 0.2,
      phases: {
        pre_build: {
          commands: [
            "echo Logging in to Amazon ECR...",
            "aws --version",
            "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REPO",
            "REPOSITORY_URI=${ECR_REPO}",
            "COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)",
            "IMAGE_TAG=${COMMIT_HASH:=latest}",
          ],
        },
        build: {
          commands: [
            "cd elasticsearch",
            "echo Build started on `date`",
            "echo Building the Docker image...",
            "docker build -t $IMAGE_NAME:latest .",
            "docker tag $IMAGE_NAME:latest $REPOSITORY_URI:$IMAGE_TAG",
            "docker tag $IMAGE_NAME:latest $REPOSITORY_URI:latest",
          ],
        },
        post_build: {
          commands: [
            "echo Build completed on `date`",
            "echo Pushing the Docker images...",
            "docker push $REPOSITORY_URI:latest",
            "docker push $REPOSITORY_URI:$IMAGE_TAG",
            "echo Writing image definitions file...",
            'printf \'[{"name":"%s","imageUri":"%s"}]\' $SERVICE_CONTAINER_NAME $REPOSITORY_URI:$IMAGE_TAG  > imagedefinitions.json',
          ],
        },
      },
      artifacts: {
        files: "imagedefinitions.json",
      },
    }),
  });

  private codeBuildAction = new actions.CodeBuildAction({
    actionName: "BuildContainer",
    project: this.CodeBuildProject,
    input: new codepipeline.Artifact("Source"),
    outputs: [new codepipeline.Artifact("Build")],
    environmentVariables: {
      ECR_REPO: {
        value: this.props.kibanaRepo.repositoryUri,
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      },
      IMAGE_NAME: {
        value: this.props.kibanaRepo.repositoryName,
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
      { stageName: "build", actions: [this.codeBuildAction] },
    ],
  });
}
