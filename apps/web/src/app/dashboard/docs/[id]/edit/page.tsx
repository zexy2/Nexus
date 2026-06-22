import { redirect } from "next/navigation";

export default async function LegacyDocumentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/docs/${id}`);
}
