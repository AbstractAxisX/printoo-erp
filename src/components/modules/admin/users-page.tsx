"use client";

// Printoo24 ERP — Users & Roles management page (admin, master-only)
//
// The missing "نمی‌توانم نقش بسازم" surface:
// - User list (active + inactive) with role badges, status toggle
// - Create-user dialog: name / email / password / role / phone
// - Edit-user dialog: rename, change role/phone, reset password
// - Role catalog strip: every USER_ROLE with live member counts
//
// Cognitive-UX:
// - Role catalog on top → the admin SEES the org structure before acting.
// - One primary action («کاربر جدید») — the page's single obvious next step.
// - Inline status switch instead of a buried menu — destructive-ish action
//   with instant visual confirmation (and API-side self-lockout guards).

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { USER_ROLE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  avatar: string | null;
  status?: string;
  createdAt?: string;
};

type FormState = {
  name: string;
  email: string;
  password: string;
  role: string;
  phone: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  role: "designer",
  phone: "",
};

// Role accent colors — consistent with MODULE_TAG palette across the app.
const ROLE_COLORS: Record<string, string> = {
  master: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  admin: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  designer: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  print: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  warehouse: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  finance: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  qc: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  crm: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  srm: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
      )}
    >
      {USER_ROLE[role]?.label ?? role}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export function UsersPage() {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.user);
  const isMaster = me?.role === "master";

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<FormState>(EMPTY_FORM);
  const [editUser, setEditUser] = React.useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = React.useState<FormState>(EMPTY_FORM);
  const [newPassword, setNewPassword] = React.useState("");

  // All users (management mode — includes inactive, master-gated server-side).
  const { data, isLoading } = useQuery({
    queryKey: ["users", "all"],
    queryFn: () => api<{ users: ManagedUser[] }>("/api/users?all=1"),
  });
  const users = data?.users ?? [];

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (body: FormState) =>
      api("/api/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateUsers();
      toast.success("کاربر جدید ایجاد شد");
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    onSuccess: () => {
      invalidateUsers();
      toast.success("کاربر به‌روزرسانی شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function invalidateUsers() {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  function openEdit(u: ManagedUser) {
    setEditUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      phone: u.phone ?? "",
    });
    setNewPassword("");
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return toast.error("نام الزامی است");
    if (!createForm.email.trim()) return toast.error("ایمیل الزامی است");
    if (createForm.password.length < 6)
      return toast.error("رمز عبور باید حداقل ۶ کاراکتر باشد");
    createMut.mutate(createForm);
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (!editForm.name.trim()) return toast.error("نام نمی‌تواند خالی باشد");
    updateMut.mutate(
      {
        id: editUser.id,
        name: editForm.name,
        role: editForm.role,
        phone: editForm.phone || null,
        ...(newPassword ? { password: newPassword } : {}),
      },
      {
        onSuccess: () => setEditUser(null),
      }
    );
  }

  // Role catalog: count members per role.
  const roleCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) counts[u.role] = (counts[u.role] ?? 0) + 1;
    return counts;
  }, [users]);

  const activeCount = users.filter((u) => u.status !== "inactive").length;

  // ── Render ──
  return (
    <div className="space-y-5">
      <PageHeader
        title="کاربران و نقش‌ها"
        description="مدیریت دسترسی کاربران تیم چاپخانه"
        icon="user"
        actions={
          <Button
            onClick={() => {
              setCreateForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
            className="gap-2"
            disabled={!isMaster}
            title={isMaster ? undefined : "فقط مدیر ارشد می‌تواند کاربر ایجاد کند"}
          >
            <Icon name="plus" size={16} /> کاربر جدید
          </Button>
        }
      />

      {/* ── Role catalog strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(USER_ROLE).map(([key, meta]) => (
          <Card key={key} className="p-4 gap-1">
            <div className="flex items-center justify-between gap-2">
              <RoleBadge role={key} />
              <span className="text-lg font-bold tabular-nums">
                {roleCounts[key] ?? 0}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {key === "master" ? "دسترسی کامل به همه بخش‌ها" : `پنل ${meta.label}`}
            </p>
          </Card>
        ))}
      </div>

      {/* ── Users table (plain card list — small roster, no virtualization) ── */}
      {isLoading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon="user"
            title="کاربری وجود ندارد"
            description="اولین کاربر را ایجاد کنید."
            action={
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Icon name="plus" size={16} /> افزودن کاربر
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <span className="text-sm font-semibold">
              فهرست کاربران
              <span className="text-muted-foreground font-normal text-xs mr-2">
                {activeCount} فعال از {users.length}
              </span>
            </span>
          </div>
          <div className="divide-y max-h-[520px] overflow-y-auto scrollbar-thin">
            {users.map((u) => {
              const isSelf = u.id === me?.id;
              const inactive = u.status === "inactive";
              return (
                <div
                  key={u.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors",
                    inactive && "opacity-60"
                  )}
                >
                  {/* Avatar + name */}
                  <span
                    className={cn(
                      "size-10 rounded-full grid place-items-center text-xs font-bold shrink-0",
                      u.role === "master"
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {initials(u.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{u.name}</span>
                      {isSelf && (
                        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                          شما
                        </span>
                      )}
                      {inactive && (
                        <span className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 rounded-full px-1.5 py-0.5">
                          غیرفعال
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                      <span dir="ltr" className="tabular-nums">{u.email}</span>
                      {u.phone && (
                        <>
                          <span className="opacity-50">•</span>
                          <span dir="ltr" className="tabular-nums">{u.phone}</span>
                        </>
                      )}
                      {u.createdAt && (
                        <>
                          <span className="opacity-50">•</span>
                          <span>عضویت: {formatDate(u.createdAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <RoleBadge role={u.role} />
                  {/* Status toggle (not for self — API blocks it anyway) */}
                  {isMaster && !isSelf ? (
                    <Switch
                      checked={!inactive}
                      onCheckedChange={(v) =>
                        updateMut.mutate({
                          id: u.id,
                          status: v ? "active" : "inactive",
                        })
                      }
                      aria-label={`فعال/غیرفعال کردن ${u.name}`}
                    />
                  ) : (
                    <span className="w-9" aria-hidden="true" />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => openEdit(u)}
                    disabled={!isMaster}
                  >
                    <Icon name="edit" size={13} /> ویرایش
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>کاربر جدید</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <UserFormFields
              form={createForm}
              setForm={setCreateForm}
              withPassword
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ایجاد کاربر
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش {editUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ایمیل (غیرقابل تغییر)</Label>
              <Input value={editForm.email} disabled dir="ltr" />
            </div>
            <UserFormFields form={editForm} setForm={setEditForm} />
            <div className="space-y-1.5">
              <Label>رمز عبور جدید (اختیاری)</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="برای تغییر رمز پر کنید"
                dir="ltr"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                انصراف
              </Button>
              <Button type="submit" disabled={updateMut.isPending} className="gap-2">
                {updateMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ذخیره تغییرات
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared form fields ───────────────────────────────────────────
function UserFormFields({
  form,
  setForm,
  withPassword,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  withPassword?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>نام و نام خانوادگی *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="مثلاً: سارا احمدی"
          autoFocus
        />
      </div>
      {withPassword && (
        <div className="space-y-1.5">
          <Label>ایمیل *</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="user@printoo24.com"
            dir="ltr"
          />
        </div>
      )}
      {withPassword && (
        <div className="space-y-1.5">
          <Label>رمز عبور *</Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="حداقل ۶ کاراکتر"
            dir="ltr"
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>نقش *</Label>
          <Select
            value={form.role}
            onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(USER_ROLE).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>شماره تماس</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="0912..."
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
}
