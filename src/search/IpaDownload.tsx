import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogHeader,
  Field,
  Layout,
  LayoutFooter,
  Text,
  TextInput,
} from "@astryxdesign/core";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useIpaDownload } from "./useIpaDownload";
import "./styles/ipa-download.css";

export function IpaDownload({
  bundleId,
  team,
  appName,
}: {
  bundleId: string;
  team?: string;
  appName?: string;
}) {
  const control = useIpaDownload(bundleId, { team, appName });
  const [code, setCode] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const formId = useId();

  useEffect(() => {
    setDialogOpen(control.awaitingCode);
  }, [control.awaitingCode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!control.awaitingCode) return;
    if (control.submitCode(code)) {
      setCode("");
    } else {
      inputRef.current?.focus();
    }
  }

  const dialogMessage = control.awaitingCode ? control.statusMessage : null;

  return (
    <span className="wx-ipa-download" data-role="ipa-download-control">
      <Button
        variant="secondary"
        label={control.label}
        data-role="ipa-download"
        isDisabled={control.disabled}
        isLoading={control.starting}
        tooltip={control.status === "done" ? "下载文件会定期清理，请及时保存" : undefined}
        onClick={() => {
          if (control.status === "done") {
            control.save();
          } else if (control.status === "awaiting_auth_code") {
            setDialogOpen(true);
          } else if (control.status === "idle" || control.status === "failed" || control.status === "cancelled") {
            control.start();
          }
        }}
      />
      {control.canCancel ? (
        <Button
          variant="ghost"
          label="取消"
          aria-label="取消当前 IPA 下载"
          data-role="ipa-download-cancel"
          isDisabled={control.canceling}
          onClick={control.cancel}
        />
      ) : null}
      {!control.awaitingCode && control.statusMessage ? (
        <Text
          as="span"
          type="supporting"
          className="wx-ipa-download-status"
          data-role="ipa-download-status"
          role="status"
        >
          {control.statusMessage}
        </Text>
      ) : null}

      {dialogOpen ? (
        <Dialog isOpen onOpenChange={setDialogOpen} purpose="form" width={440}>
          <Layout
            header={<DialogHeader title="输入授权码" subtitle={bundleId} onOpenChange={setDialogOpen} />}
            content={
              <form id={formId} className="wx-ipa-auth-form" onSubmit={handleSubmit}>
                <div className="wx-ipa-auth-meta">
                  <Badge variant="neutral" label="6 位数字" data-role="ipa-auth-badge" />
                  <Text as="span" type="supporting">
                    验证通过后，同一批次中排队的任务会共用刷新后的会话。
                  </Text>
                </div>
                <Field label="Apple ID 两步验证码" inputID={inputId} description="验证码只需输入一次。">
                  <TextInput
                    ref={inputRef}
                    id={inputId}
                    label="验证码"
                    isLabelHidden
                    data-role="ipa-auth-code"
                    value={code}
                    placeholder="6 位验证码"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    hasSpellCheck={false}
                    hasAutoFocus
                    onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                  />
                </Field>
                {dialogMessage ? (
                  control.messageTone === "error" ? (
                    <Banner
                      status="error"
                      title={dialogMessage}
                      data-role="ipa-auth-error"
                      role="alert"
                    />
                  ) : (
                    <Text as="p" type="supporting" data-role="ipa-auth-hint" role="status">
                      {dialogMessage}
                    </Text>
                  )
                ) : null}
              </form>
            }
            footer={
              <LayoutFooter hasDivider>
                <div className="wx-ipa-auth-actions">
                  <Button
                    variant="ghost"
                    label="取消"
                    data-role="ipa-auth-cancel"
                    isDisabled={control.canceling}
                    onClick={control.cancel}
                  />
                  <Button
                    type="submit"
                    form={formId}
                    variant="secondary"
                    label="提交"
                    data-role="ipa-auth-submit"
                    isDisabled={control.submitting}
                    isLoading={control.submitting}
                  />
                </div>
              </LayoutFooter>
            }
          />
        </Dialog>
      ) : null}
    </span>
  );
}
