import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./server/routers";
import superjson from "superjson";

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:3000/api/trpc",
      transformer: superjson,
    }),
  ],
});

async function main() {
  const dummyCsv = `date,year,month,day,app,adpf,adnetwork1,estimated revenue,confirmed revenue,impressions,clicks,requests,fills,currency
2026-04-01,2026,4,1,ocb,3rd Party,AdMob,100,100,1000,10,1200,1100,KRW
`;

  console.log("Uploading dummy CSV...");
  try {
    const res = await trpc.dashboard.uploadCsvChunk.mutate({
      fileName: "dummy.csv",
      chunkIndex: 0,
      totalChunks: 1,
      chunkContent: dummyCsv,
      isFirstChunk: true,
      fileMinDate: "2026-04-01",
      fileMaxDate: "2026-04-01",
    });
    console.log("Upload result:", res);
  } catch (error) {
    console.error("Upload failed:");
    console.error(error);
  }
}

main();
