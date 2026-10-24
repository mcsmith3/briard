# @briard/durable-sdk

Show a durable agent on your phone through [Briard](https://github.com/mcsmith3/briard). Your durable agent opens a
private Unix socket, or serves the same wire over HTTPS with a bearer token, lays out its conversations as panes, and
asks its questions there. Briard dials the socket or the URL and shows each question as a card on the phone, with chat
and history, and you answer with one tap.

**Experimental.** The package is published under the npm dist-tag `experimental`, never `latest`. The durable wire may
change, or the feature may be removed, in a later minor release of Briard. The full guide is the
[Durable agents page](https://github.com/mcsmith3/briard/blob/main/docs/durable-agents.md).

## Install

```sh
npm install @briard/durable-sdk@experimental
# or
bun add @briard/durable-sdk@experimental
```

It needs Node 22.19 or later, or Bun 1.4 or later, on Linux. Node 22.19 is the floor of Pi Durable 1.2.0. It has no
runtime dependency. On macOS, Node runs it, and Bun runs it with `callerCheck: "off"`, because the descendant check
needs Linux.

## A first durable agent

This durable agent shows one question on the phone, prints the answer and exits:

```ts
import { openBriard } from "@briard/durable-sdk";

const socket = process.env.BRIARD_DURABLE_SOCKET ?? `${process.env.XDG_RUNTIME_DIR}/hello/app.sock`;
const briard = await openBriard({ socket, hostName: "hello", caps: { asks: true } });
const pane = briard.workspace("hello", { title: "Hello" }).tab("main", { title: "Questions" }).pane("deploy", { title: "Deploy", harness: "hello" });
briard.ready();
console.log(`listening ${briard.address}`);
const options = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
const answer = await pane.ask({ kind: "choice", toolCallId: "deploy-1", itemId: "deploy-1", title: "Deploy to staging?", options });
console.log(`answer: ${answer.optionIds[0]}`);
await briard.close();
```

Run it with `node hello.mjs` (or save it as `hello.ts` and run `bun hello.ts`), then attach the socket it printed to
your Briard: `briard durable attach hello --socket <path> --restart`.

To ask before a tool runs, `requireApproval(toolName, args, { pane, toolCallId })` raises an Allow and Deny card and
returns who decided and when. Only Allow from the phone approves.

## A hosted durable agent

A durable agent behind a URL must serve the Briard wire and check the bearer token. A stock Pi Durable demo does neither, so
Briard cannot attach it as it is. Briard polls a hosted durable agent every 2 s while a phone watches, else every 10 s. Each
poll wakes a hibernating Durable Object, so a hosted object stays awake while Briard watches. The wire has no
WebSocket, so the hibernation and WebSocket features of Durable Objects do not help here.

On a send, the label queued is Briard's own reading of the turn, and Pi's inbox is not shown. A task that sleeps until
a deadline shows as idle or working, never as waiting.

## A durable agent on durable-harness

**Experimental.** A Pi agent on Vercel's `durable-harness` needs one wrapper around its opener and one route. It is tested
self-hosted, in one Node process on a local World. It is untested on Vercel.

```ts
import { briardRoute, withBriard } from "@briard/durable-sdk/durable-harness";
import { resumeWith } from "durable-harness/pi-durable";
// Harness, models, ctx and registry are your Pi agent's own.

const open = resumeWith(
  withBriard((storage, reg) => Harness.open(storage, { models, registry: reg }, ctx), {
    registry,
    risky: new Set(["deploy"]),
  }),
);
export const briard = briardRoute({ open, token: process.env.BRIARD_TOKEN });
```

Mount `briard` under a path that ends in `/session/v1`, then attach it with
`briard durable attach desk --url https://your-app.example.com/briard --token-env BRIARD_TOKEN`. The phone reads,
answers, sends while the session is idle, stops and reads the history. A stop does not call back a tool that has
started: it finishes, and does its work, while the log says it was aborted. On a local World, serve the route from the
process that runs the queue. The steps, the cost and the limits are in the
[Durable agents page](https://github.com/mcsmith3/briard/blob/main/docs/durable-agents.md).

## The entries

| Import | What it is |
| --- | --- |
| `@briard/durable-sdk` | `openBriard` and the whole API. On Bun it serves the socket with the descendant check, elsewhere with `node:http`. |
| `@briard/durable-sdk/bun` | The Bun server only. |
| `@briard/durable-sdk/node` | The `node:http` server only. |
| `@briard/durable-sdk/pi` | The glue for a [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) agent: a conversation as a pane, a risky tool call as a card, history from Pi's store. |
| `@briard/durable-sdk/core` | The layout and the wire as one function, `handle(request)`, for a durable agent that brings its own transport. |
| `@briard/durable-sdk/durable-harness` | Experimental. A Pi agent on Vercel's [durable-harness](https://www.npmjs.com/package/durable-harness): `briardRoute`, a web route that reads the wire from the World on every request, and `withBriard`, an opener whose guard asks the phone through the run's journal. Self-hosted only; Vercel is untested. |

**On Node, a durable agent cannot read who connects to its socket.** Node has no way to read the caller of a Unix socket, so
the descendant check (which refuses an answer, or any other act, from the durable agent itself or from a process it started)
cannot run, and the Node server writes one line at start that says so. Any process of your user can answer a card. Run
the agent's tools in a sandbox that cannot reach the socket, or run the durable agent on Bun.

`./pi` needs `@earendil-works/pi-durable`, `@earendil-works/pi-ai` and `@earendil-works/chord`, 1.1 or later and below
2. The entry is tested with Pi Durable 1.1.0 and 1.2.0. The three are optional peer dependencies: install them yourself, and a durable agent that never imports `./pi` needs none.

`./durable-harness` needs the three Pi packages and two more optional peers, at the exact versions it is tested on:
`durable-harness` 0.0.1-beta.6 and `@workflow/world` 5.0.5 (World spec 8; tested with `@workflow/world-local` 5.1.2,
Pi 1.2.0, Node 22 and later). A beta moves its API between releases, so the route checks the installed
`durable-harness` and the World's spec at its first request, and answers every request 500 with one line naming both
versions when either differs.

## Versions

The package has its own version, apart from Briard's. `SDK_VERSION` is that version, and `WIRE_VERSION` is the
durable wire version it speaks, which is 1. The contract is
[WIRE.md](https://github.com/mcsmith3/briard/blob/main/bridge/mux/durable/WIRE.md).

## Publish

Only Altan publishes this package, from his own npm account. CI never publishes. Before a publish:

- bump the version in `packages/durable-sdk/package.json`, and add its section to `packages/durable-sdk/CHANGELOG.md`
- commit, so the tree is clean
- run `bun run sdk:build` and `scripts/sdk-pack-check.sh` at the repo root, and see `pack check: ok`

Then:

```sh
cd packages/durable-sdk
npm publish --access public --tag experimental
```

## License

MIT. See [LICENSE](./LICENSE).
