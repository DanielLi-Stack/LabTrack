import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EquipmentForm } from "@/components/equipment-form";
import { PageTitle } from "@/components/server-ui";
export default async function EditEquipment({ params }: { params: Promise<{ id: string }> }) { const user = await requireUser(); if (user.role === "MEMBER") redirect("/equipment"); const { id } = await params; const [equipment, users] = await Promise.all([db.equipment.findUnique({ where: { id }, include: { accessories: true } }), db.userProfile.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } })]); if (!equipment) notFound(); return <><PageTitle title={`编辑 ${equipment.name}`} subtitle={`资产编号 ${equipment.assetCode}`}/><EquipmentForm equipment={equipment} users={users}/></>; }
