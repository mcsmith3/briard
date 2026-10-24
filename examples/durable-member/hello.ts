// The smallest durable program: it shows one question on the phone, prints the answer, and exits.
//   bun hello.ts
// It imports the SDK and nothing else. The socket is $BRIARD_DURABLE_SOCKET, or a private folder under $XDG_RUNTIME_DIR.
import { openBriard } from "../../packages/durable-sdk/src/index.ts";

const socket = process.env.BRIARD_DURABLE_SOCKET ?? `${process.env.XDG_RUNTIME_DIR}/hello/app.sock`;
// Declare only what this program does: it asks. Every other cap is off.
const briard = await openBriard({ socket, hostName: "hello", caps: { asks: true } });
const pane = briard.workspace("hello", { title: "Hello" }).tab("main", { title: "Questions" }).pane("deploy", { title: "Deploy", harness: "hello" });
briard.ready();
console.log(`listening ${briard.address}`);
const options = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
const answer = await pane.ask({ kind: "choice", toolCallId: "deploy-1", itemId: "deploy-1", title: "Deploy to staging?", options });
console.log(`answer: ${answer.optionIds[0]}`);
await briard.close();
