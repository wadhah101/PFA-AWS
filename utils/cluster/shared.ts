import {
  ECSClient,
  ListServicesCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import { fromIni } from "@aws-sdk/credential-provider-ini";

const client = new ECSClient({
  region: "eu-west-3",
  credentials: fromIni({ profile: "PFA" }),
});

const targetARN = "arn:aws:ecs:eu-west-3:316616769018:cluster/elk-cluster-dev";
export const changeDevClusterDesiredCount = async (desiredCount: number) => {
  const result = await client.send(
    new ListServicesCommand({ cluster: targetARN })
  );

  const commands = result.serviceArns?.map(
    (e) =>
      new UpdateServiceCommand({ cluster: targetARN, service: e, desiredCount })
  );

  const requests = await Promise.all(commands!!.map((e) => client.send(e)));

  console.log(requests);
};
