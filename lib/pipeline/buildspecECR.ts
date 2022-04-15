import { aws_codebuild as codebuild } from "aws-cdk-lib";

export const containerCodeBuild = (dir: string) =>
  codebuild.BuildSpec.fromObject({
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
          `cd ${dir}`,
          "echo Build started on `date`",
          "echo Building the Docker image...",
          "docker build -t $IMAGE_NAME:latest --build-arg ELASTIC_VERSION=$ELASTIC_VERSION .",
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
      files: `${dir}/imagedefinitions.json`,
    },
  });
