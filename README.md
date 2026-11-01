# HiveNet

## Run two real local nodes

Start Vite and both local HiveNet nodes with one command:

```bash
npm run dev:two-nodes
```

Or start the nodes separately in two terminals. First, start the development server and Node A:

```bash
npm run dev
```

Then launch Node B:

```bash
npm run dev:node2
```

The second node uses a separate application data profile, gets its own node ID, and listens on port `9002`. In either window, open **Connected Nodes** and connect to `127.0.0.1` using the other node's port (`9001` or `9002`). Each profile keeps its identity and peer list across restarts.

The first instance uses the normal HiveNet application data directory and configured port. Additional instances can be launched with `--hivenet-profile=<name> --hivenet-port=<port> --hivenet-name=<name>` after `electron .`; each profile needs a unique profile name and listening port.

## Share files between nodes

Connect the sending node to the receiving node in **Connected Nodes**, then open **Share a File**, choose a file and select the online peer as the destination. Transfers are limited to 100 MB and checked with SHA-256. The receiving node stores the file under its HiveNet edge storage directory; it appears in **Shared Files**, where it can be saved to a chosen location.

The node HTTP server exposes `GET /files` to list stored file metadata, `POST /files` to receive a file stream, and `GET /files/<file-id>` to retrieve its bytes. Stored file names and hashes are indexed locally in `files-index.json`.
