import Tracking from "@/components/tracking";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Tracking number={(await params).id} />;
}
