import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import {
  createLinkToken,
  exchangePublicToken,
  fetchPlaidStatus,
  getApiBaseUrl,
  listPlaidAccounts,
  pullLinkedAccounts,
  sandboxConnect,
  upsertCustomer,
  type BankTransaction,
  type CustomerProfile,
  type PlaidAccountOption,
} from "../lib/api";
import "./PlaidTestPage.css";

type Step =
  | "idle"
  | "linking"
  | "exchanging"
  | "select"
  | "pulling"
  | "done"
  | "error";

function isDepository(account: PlaidAccountOption) {
  return account.type === "depository";
}

export default function PlaidTestPage() {
  const [clientUserId, setClientUserId] = useState(
    () => `test-${crypto.randomUUID().slice(0, 8)}`,
  );
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<
    PlaidAccountOption[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [storedProfile, setStoredProfile] = useState<CustomerProfile | null>(
    null,
  );
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [transactionSyncNote, setTransactionSyncNote] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetchPlaidStatus()
      .then((s) => {
        setEnvironment(s.environment);
        setDbPath(s.databasePath);
      })
      .catch(() => {
        setEnvironment(null);
        setDbPath(null);
      });
  }, []);

  const ensureCustomer = useCallback(async () => {
    const { customer } = await upsertCustomer(clientUserId);
    setCustomerId(customer.id);
    return customer.id;
  }, [clientUserId]);

  const beginAccountSelection = useCallback(
    async (
      id: string,
      linkMeta: PlaidLinkOnSuccessMetadata | null,
    ) => {
      const { accounts, itemId: plaidItemId } = await listPlaidAccounts(id);
      setItemId(plaidItemId);
      setAvailableAccounts(accounts);

      const fromLink = new Set(linkMeta?.accounts?.map((a) => a.id) ?? []);
      const depository = accounts.filter(isDepository);

      const initial =
        fromLink.size > 0
          ? accounts
              .filter((a) => fromLink.has(a.accountId))
              .map((a) => a.accountId)
          : depository.map((a) => a.accountId);

      setSelectedIds(new Set(initial));
      setStep("select");
    },
    [],
  );

  const finishExchange = useCallback(
    async (
      id: string,
      publicToken: string,
      linkMeta: PlaidLinkOnSuccessMetadata | null,
    ) => {
      setStep("exchanging");
      setError(null);
      setStoredProfile(null);

      const inst = linkMeta?.institution;
      const result = await exchangePublicToken(
        id,
        publicToken,
        inst
          ? {
              id: inst.institution_id,
              name: inst.name,
            }
          : undefined,
      );
      setItemId(result.itemId);
      await beginAccountSelection(id, linkMeta);
    },
    [beginAccountSelection],
  );

  const onSuccess = useCallback(
    async (publicToken: string, meta: PlaidLinkOnSuccessMetadata) => {
      if (!customerId) return;
      try {
        await finishExchange(customerId, publicToken, meta);
      } catch (err) {
        setStep("error");
        setError(err instanceof Error ? err.message : "Exchange failed");
      }
    },
    [customerId, finishExchange],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) {
        setStep("error");
        setError(err.display_message ?? err.error_message ?? "Link exited");
      } else if (step === "linking") {
        setStep("idle");
      }
    },
  });

  useEffect(() => {
    if (linkToken && ready && step === "linking") {
      open();
    }
  }, [linkToken, ready, open, step]);

  function resetSession() {
    setCustomerId(null);
    setItemId(null);
    setAvailableAccounts([]);
    setSelectedIds(new Set());
    setStoredProfile(null);
  }

  async function startLink() {
    setStep("linking");
    setError(null);
    resetSession();
    setLinkToken(null);

    try {
      const id = await ensureCustomer();
      const { linkToken: token } = await createLinkToken(id, clientUserId);
      setLinkToken(token);
    } catch (err) {
      setStep("error");
      setError(
        err instanceof Error ? err.message : "Could not create link token",
      );
    }
  }

  async function runSandboxShortcut() {
    setStep("exchanging");
    setError(null);
    resetSession();

    try {
      const id = await ensureCustomer();
      const result = await sandboxConnect(id);
      setItemId(result.itemId);
      await beginAccountSelection(id, null);
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Sandbox shortcut failed");
    }
  }

  function toggleAccount(accountId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function selectDepositoryOnly() {
    setSelectedIds(
      new Set(availableAccounts.filter(isDepository).map((a) => a.accountId)),
    );
  }

  async function pullSelectedData() {
    if (!customerId || selectedIds.size === 0) return;

    setStep("pulling");
    setError(null);

    try {
      const result = await pullLinkedAccounts(customerId, [...selectedIds]);
      setStoredProfile(result.stored);
      setTransactions(result.transactions);
      if ("error" in result.transactionSync) {
        setTransactionSyncNote(result.transactionSync.error);
      } else {
        const { added, modified, removed } = result.transactionSync;
        setTransactionSyncNote(
          `Synced ${added} new, ${modified} updated, ${removed} removed`,
        );
      }
      setStep("done");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Failed to pull data");
    }
  }

  const depositoryCount = availableAccounts.filter(isDepository).length;

  return (
    <div className="plaid-test">
      <header className="plaid-test-header">
        <Link to="/" className="plaid-test-back">
          ← VetFin home
        </Link>
        <h1>Plaid sandbox test</h1>
        <p className="plaid-test-meta">
          API: <code>{getApiBaseUrl()}</code>
          {environment ? (
            <>
              {" "}
              · Plaid: <strong>{environment}</strong>
            </>
          ) : null}
          {dbPath ? (
            <>
              {" "}
              · DB: <code>{dbPath}</code>
            </>
          ) : null}
        </p>
        {customerId ? (
          <p className="plaid-test-meta">
            Customer ID: <code>{customerId}</code> (saved in SQLite)
          </p>
        ) : null}
      </header>

      <div className="plaid-test-grid">
        <section className="plaid-test-card">
          <h2>1. Connect with Plaid Link</h2>
          <p>
            Creates a customer record, then opens Link. Selected accounts are
            stored in the database after you pull data.
          </p>

          <label className="plaid-test-label">
            Client user ID
            <input
              type="text"
              value={clientUserId}
              onChange={(e) => setClientUserId(e.target.value)}
              disabled={step !== "idle" && step !== "error" && step !== "done"}
            />
          </label>

          <div className="plaid-test-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={startLink}
              disabled={
                step === "linking" ||
                step === "exchanging" ||
                step === "pulling"
              }
            >
              {step === "linking" ? "Opening Link…" : "Connect bank account"}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={runSandboxShortcut}
              disabled={
                step === "linking" ||
                step === "exchanging" ||
                step === "pulling"
              }
            >
              Skip Link (sandbox)
            </button>
          </div>

          {error ? <p className="plaid-test-error">{error}</p> : null}
          {step === "exchanging" ? (
            <p className="plaid-test-status">Saving to database…</p>
          ) : null}
        </section>

        <section className="plaid-test-card plaid-test-card--help">
          <h2>Where data is stored</h2>
          <p>
            SQLite file on the API server (<code>api/data/vetfin.sqlite</code>):
          </p>
          <ul className="plaid-test-storage-list">
            <li>
              <strong>customers</strong> — your test user ID
            </li>
            <li>
              <strong>plaid_items</strong> — Plaid item + access token
            </li>
            <li>
              <strong>bank_accounts</strong> — linked accounts, routing, owners
            </li>
            <li>
              <strong>bank_transactions</strong> — synced Plaid transactions per
              account
            </li>
          </ul>
          <p className="plaid-test-note">
            Set <code>DATA_ENCRYPTION_KEY</code> in <code>api/.env</code> to
            encrypt tokens and account numbers at rest.
          </p>
        </section>
      </div>

      {step === "select" && customerId ? (
        <section className="plaid-test-results">
          <h2>2. Choose accounts to link</h2>
          <p className="plaid-test-select-lead">
            Item <code>{itemId}</code> saved for customer{" "}
            <code>{customerId}</code>.
          </p>

          <div className="plaid-test-select-toolbar">
            <button
              type="button"
              className="btn btn--secondary plaid-test-select-btn"
              onClick={selectDepositoryOnly}
            >
              Select checking &amp; savings ({depositoryCount})
            </button>
            <button
              type="button"
              className="btn btn--secondary plaid-test-select-btn"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear all
            </button>
          </div>

          <ul className="plaid-test-account-list">
            {availableAccounts.map((account) => (
              <li key={account.accountId}>
                <label className="plaid-test-account-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(account.accountId)}
                    onChange={() => toggleAccount(account.accountId)}
                  />
                  <span className="plaid-test-account-info">
                    <strong>{account.name}</strong>
                    {account.mask ? (
                      <span className="plaid-test-account-mask">
                        ····{account.mask}
                      </span>
                    ) : null}
                    <span className="plaid-test-account-type">
                      {account.subtype ?? account.type}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn--primary"
            disabled={selectedIds.size === 0}
            onClick={pullSelectedData}
          >
            Save {selectedIds.size} account
            {selectedIds.size === 1 ? "" : "s"} to database
          </button>
        </section>
      ) : null}

      {step === "pulling" ? (
        <p className="plaid-test-status plaid-test-status--block">
          Pulling from Plaid and writing to SQLite…
        </p>
      ) : null}

      {step === "done" && storedProfile ? (
        <section className="plaid-test-results">
          <h2>3. Stored in database</h2>
          <p className="plaid-test-select-lead">
            Customer <code>{storedProfile.customer.id}</code> ·{" "}
            {storedProfile.bankAccounts.length} linked account
            {storedProfile.bankAccounts.length === 1 ? "" : "s"}
          </p>

          {storedProfile.plaidItems.map((item) => (
            <p key={item.id} className="plaid-test-linked-meta">
              Plaid item <code>{item.itemId}</code>
              {item.institutionName ? ` · ${item.institutionName}` : ""}
            </p>
          ))}

          {transactionSyncNote ? (
            <p className="plaid-test-linked-meta">{transactionSyncNote}</p>
          ) : null}

          {storedProfile.bankAccounts.map((account) => {
            const accountTx = transactions.filter(
              (tx) => tx.bankAccountId === account.id,
            );
            return (
              <article key={account.id} className="plaid-test-linked-card">
                <h3>
                  {account.name}
                  {account.mask ? ` ····${account.mask}` : ""}
                </h3>
                <p className="plaid-test-linked-meta">
                  DB id <code>{account.id}</code> · Plaid{" "}
                  <code>{account.plaidAccountId}</code>
                  {account.transactionCount > 0
                    ? ` · ${account.transactionCount} transaction${account.transactionCount === 1 ? "" : "s"}`
                    : ""}
                </p>
                {account.routing ? (
                  <p>
                    ACH routing <code>{account.routing}</code>
                    {account.accountNumberMask
                      ? ` · account ${account.accountNumberMask}`
                      : ""}
                  </p>
                ) : null}
                {account.owners.length > 0 ? (
                  <>
                    <h4>Owners</h4>
                    <ul>
                      {account.owners.map((owner, i) => (
                        <li key={i}>{owner.names.join(", ") || "—"}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {accountTx.length > 0 ? (
                  <>
                    <h4>Recent transactions</h4>
                    <ul className="plaid-test-tx-list">
                      {accountTx.slice(0, 10).map((tx) => (
                        <li key={tx.id}>
                          <span className="plaid-test-tx-date">{tx.date}</span>{" "}
                          <span className="plaid-test-tx-name">{tx.name}</span>{" "}
                          <span className="plaid-test-tx-amount">
                            {tx.amount.toLocaleString("en-US", {
                              style: "currency",
                              currency: tx.isoCurrencyCode ?? "USD",
                            })}
                          </span>
                          {tx.pending ? (
                            <span className="plaid-test-tx-pending">
                              pending
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </article>
            );
          })}

          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              resetSession();
              setStep("idle");
            }}
          >
            Start over
          </button>
        </section>
      ) : null}
    </div>
  );
}
