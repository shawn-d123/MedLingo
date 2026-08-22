import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/store";

export async function GET() {
  return NextResponse.json(listJobs());
}

// Person A: POST here from the capture view (photo + language) to open a job.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const job = createJob(body);
  return NextResponse.json(job, { status: 201 });
}
