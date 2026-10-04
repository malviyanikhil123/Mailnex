import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, FlaskConical, ChevronDown } from "lucide-react";
import { inboxApi, type RuleInput } from "../../services/inbox.api";
import { Button, Input, Spinner } from "../ui/primitives";
import { JOB_STATUS_ORDER, jobStatusLabel } from "./WhyBadge";
import { toast } from "../../store/toast";
import type {
  InboxCategory, InboxRuleField, InboxRuleMatch, InboxRuleTestResult, JobApplicationStatus,
} from "../../types/api";

const FIELD_LABELS: Record<InboxRuleField, string> = {
  FROM_ADDRESS: "Sender address",
  FROM_DOMAIN: "Sender domain",
  SUBJECT: "Subject",
  BODY: "Body",
  ANY_TEXT: "Anywhere",
};

const MATCH_LABELS: Record<InboxRuleMatch, string> = {
  CONTAINS: "contains",
  EQUALS: "is exactly",
  STARTS_WITH: "starts with",
  ENDS_WITH: "ends with",
  REGEX: "matches regex",
};

export function RuleEditor({ category }: { category: InboxCategory }) {
  const qc = useQueryClient();
  const [field, setField] = useState<InboxRuleField>("SUBJECT");
  const [matchType, setMatchType] = useState<InboxRuleMatch>("CONTAINS");
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState("");
  const [subStatus, setSubStatus] = useState<JobApplicationStatus | "">("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResult, setTestResult] = useState<InboxRuleTestResult | null>(null);

  const rulesQ = useQuery({
    queryKey: ["inbox", "rules", category.id],
    queryFn: () => inboxApi.listRules(category.id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["inbox", "rules", category.id] });
    void qc.invalidateQueries({ queryKey: ["inbox", "categories"] });
  };

  const createRule = useMutation({
    mutationFn: (input: RuleInput) => inboxApi.createRule(category.id, input),
    onSuccess: () => {
      setValue("");
      setSubStatus("");
      setTestResult(null);
      invalidate();
      toast.success("Rule added");
    },
    onError: (err) => {
      const res = (err as { response?: { status?: number; data?: { message?: string } } }).response;
      toast.error(
        res?.status === 409
          ? "You already have that exact rule on this category"
          : res?.data?.message ?? "Could not add that rule",
      );
    },
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      inboxApi.updateRule(id, { enabled }),
    onSuccess: invalidate,
    onError: () => toast.error("Could not update that rule"),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => inboxApi.deleteRule(id),
    onSuccess: () => {
      invalidate();
      toast.success("Rule removed");
    },
    onError: () => toast.error("Could not remove that rule"),
  });

  const testRule = useMutation({
    mutationFn: () => inboxApi.testRule({ field, matchType, value }),
    onSuccess: setTestResult,
    onError: (err) => {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message ?? "Could not test that rule");
    },
  });

  const rules = rulesQ.data ?? [];

  return (
    <div className="space-y-3">
      {rulesQ.isLoading ? (
        <Spinner />
      ) : rules.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No rules yet. Without one, mail only reaches this category if the AI decides it belongs.
        </p>
      ) : (
        <ul className="divide-y divide-[#BAE6FD] rounded-lg border border-[#BAE6FD] dark:divide-[#164549] dark:border-[#164549]">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => toggleRule.mutate({ id: rule.id, enabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#60A5FA] dark:accent-[#71C9CE]"
                aria-label={rule.enabled ? "Disable this rule" : "Enable this rule"}
              />
              <span className={rule.enabled ? "text-gray-800 dark:text-gray-200" : "text-gray-400 line-through"}>
                {FIELD_LABELS[rule.field]} {MATCH_LABELS[rule.matchType]}{" "}
                <strong className="font-semibold">&ldquo;{rule.value}&rdquo;</strong>
              </span>
              {rule.subStatus && (
                <span className="rounded-full bg-[#BAE6FD] px-1.5 py-0.5 text-[10px] font-semibold text-gray-800 dark:bg-[#164549] dark:text-[#A6E3E9]">
                  → {jobStatusLabel(rule.subStatus)}
                </span>
              )}
              <span className="text-gray-400" title="Lower numbers are checked first">
                p{rule.priority}
              </span>
              <span
                className={`ml-auto ${rule.matchCount === 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-500"}`}
                title={
                  rule.matchCount === 0
                    ? "This rule has never matched anything"
                    : `Last matched ${rule.lastMatchedAt ? new Date(rule.lastMatchedAt).toLocaleString() : "recently"}`
                }
              >
                {rule.matchCount === 0 ? "never matched" : `${rule.matchCount} matches`}
              </span>
              <button
                onClick={() => deleteRule.mutate(rule.id)}
                className="rounded p-1 text-gray-400 transition hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
                aria-label="Remove this rule"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-dashed border-[#BAE6FD] p-3 dark:border-[#164549]">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={field}
            onChange={(e) => setField(e.target.value as InboxRuleField)}
            aria-label="Which part of the email to check"
            className="rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2 py-1.5 text-xs outline-none dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-200"
          >
            {(Object.keys(FIELD_LABELS) as InboxRuleField[]).map((f) => (
              <option key={f} value={f}>{FIELD_LABELS[f]}</option>
            ))}
          </select>
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as InboxRuleMatch)}
            aria-label="How to match"
            className="rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2 py-1.5 text-xs outline-none dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-200"
          >
            {(Object.keys(MATCH_LABELS) as InboxRuleMatch[])
              // REGEX is behind the Advanced disclosure — it is the one option that
              // can be written wrongly in a way that silently never matches.
              .filter((m) => m !== "REGEX" || showAdvanced)
              .map((m) => (
                <option key={m} value={m}>{MATCH_LABELS[m]}</option>
              ))}
          </select>
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setTestResult(null);
            }}
            placeholder={field === "FROM_DOMAIN" ? "linkedin.com" : "interview"}
            className="min-w-[10rem] flex-1 !py-1.5 !text-xs"
          />
        </div>

        {field === "FROM_DOMAIN" && matchType === "EQUALS" && (
          <p className="text-[11px] text-gray-500 dark:text-gray-500">
            Also matches sending subdomains, so <code>chase.com</code> catches{" "}
            <code>email.chase.com</code>.
          </p>
        )}

        {showAdvanced && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
              Priority
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="100"
                className="w-20 !py-1 !text-xs"
              />
            </label>
            {category.trackSubStatus && (
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                Sets stage
                <select
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value as JobApplicationStatus | "")}
                  className="rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2 py-1 text-xs outline-none dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-200"
                >
                  <option value="">None</option>
                  {JOB_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{jobStatusLabel(s)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {testResult && (
          <div className="rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] p-2.5 text-[11px] dark:border-[#164549] dark:bg-[#091517]">
            <p className="font-semibold text-gray-800 dark:text-gray-200">
              Matches {testResult.matches} of your {testResult.scanned} stored emails
            </p>
            {testResult.sample.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-gray-600 dark:text-gray-400">
                {testResult.sample.map((s) => (
                  <li key={s.id} className="truncate">
                    {s.fromAddress} — {s.subject || "(no subject)"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={!value.trim() || testRule.isPending}
            onClick={() => testRule.mutate()}
            className="flex items-center gap-1.5 !py-1.5 !text-xs"
          >
            <FlaskConical size={12} />
            {testRule.isPending ? "Testing…" : "Test"}
          </Button>
          <Button
            disabled={!value.trim() || createRule.isPending}
            onClick={() =>
              createRule.mutate({
                field,
                matchType,
                value: value.trim(),
                ...(priority ? { priority: Number(priority) } : {}),
                ...(subStatus ? { subStatus } : {}),
              })
            }
            className="!py-1.5 !text-xs"
          >
            {createRule.isPending ? "Adding…" : "Add rule"}
          </Button>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-gray-500 underline dark:text-gray-400"
          >
            <ChevronDown size={11} className={showAdvanced ? "rotate-180 transition" : "transition"} />
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
        </div>
      </div>
    </div>
  );
}
