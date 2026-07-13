import "server-only";
import * as crypto from "crypto";

// ── AES-128-CBC encrypt / decrypt ─────────────────────────────────────────

function md5(str: string): Buffer {
  return crypto.createHash("md5").update(str, "utf8").digest();
}

function encrypt(plainText: string, workingKey: string): string {
  const key = md5(workingKey);
  const iv  = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  return cipher.update(plainText, "utf8", "hex") + cipher.final("hex");
}

function decrypt(encryptedText: string, workingKey: string): string {
  const key = md5(workingKey);
  const iv  = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  return decipher.update(encryptedText, "hex", "utf8") + decipher.final("utf8");
}

// ── Types ─────────────────────────────────────────────────────────────────

export type CCAvenueOrderParams = {
  orderId:        string;   // our paymentGatewayOrderId e.g. WA-1234567890
  amount:         string;   // e.g. "250.00"
  currency:       string;   // e.g. "AED"
  customerName:   string;
  customerPhone:  string;
  customerEmail?: string;
  billingAddress: string;
  redirectUrl:    string;   // portal webhook URL
  cancelUrl:      string;
  merchantId:     string;
  accessCode:     string;
  workingKey:     string;
  websiteUrl:     string;
};

export type CCAvenueWebhookData = {
  order_id:           string;
  tracking_id:        string;
  bank_ref_no:        string;
  order_status:       string;  // "Success" | "Failure" | "Aborted"
  amount:             string;
  currency:           string;
  payment_mode:       string;
  card_name:          string;
  status_message:     string;
  merchant_param1?:   string;
};

// ── Build CCAvenue hosted checkout URL ────────────────────────────────────

export function buildCCAvenueCheckoutUrl(params: CCAvenueOrderParams): string {
  const merchantData = [
    `merchant_id=${params.merchantId}`,
    `order_id=${params.orderId}`,
    `amount=${params.amount}`,
    `currency=${params.currency}`,
    `redirect_url=${params.redirectUrl}`,
    `cancel_url=${params.cancelUrl}`,
    `language=EN`,
    `billing_name=${params.customerName}`,
    `billing_tel=${params.customerPhone}`,
    `billing_email=${params.customerEmail ?? ""}`,
    `billing_address=${params.billingAddress}`,
    `billing_city=`,
    `billing_state=`,
    `billing_zip=`,
    `billing_country=UAE`,
    `merchant_param1=${params.orderId}`,
  ].join("&");

  const encryptedData = encrypt(merchantData, params.workingKey);

  return `https://secure.ccavenue.ae/transaction/transaction.do?command=initiateTransaction&merchant_id=${params.merchantId}&encRequest=${encryptedData}&access_code=${params.accessCode}`;
}

// ── Decrypt CCAvenue webhook response ─────────────────────────────────────

export function decryptCCAvenueWebhook(
  encResponse: string,
  workingKey: string,
): CCAvenueWebhookData {
  const decrypted = decrypt(encResponse, workingKey);
  const params = new URLSearchParams(decrypted);
  return {
    order_id:       params.get("order_id")       ?? "",
    tracking_id:    params.get("tracking_id")    ?? "",
    bank_ref_no:    params.get("bank_ref_no")    ?? "",
    order_status:   params.get("order_status")   ?? "",
    amount:         params.get("amount")         ?? "",
    currency:       params.get("currency")       ?? "",
    payment_mode:   params.get("payment_mode")   ?? "",
    card_name:      params.get("card_name")      ?? "",
    status_message: params.get("status_message") ?? "",
    merchant_param1: params.get("merchant_param1") ?? undefined,
  };
}
