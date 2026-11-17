import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EquipmentForm } from "@/components/equipment-form";
import { PageTitle } from "@/components/server-ui";
export default async function NewEquipment() { const user = await requireUser(); if (user.role === "MEMBER") redirect("/equipment"); const users = await db.userProfile.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }); return <><PageTitle title="添加设备" subtitle="每件实体设备应有独立资产编号"/><EquipmentForm users={users}/></>; }
