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
  orderId:        string;
  amount:         string;
  currency:       string;
  customerName:   string;
  customerPhone:  string;
  customerEmail?: string;
  billingAddress: string;
  redirectUrl:    string;
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
  order_status:       string;
  amount:             string;
  currency:           string;
  payment_mode:       string;
  card_name:          string;
  status_message:     string;
  merchant_param1?:   string;
};

/** E = Email only, S = SMS only, B = Both */
export type CCAvenueDeliveryType = "E" | "S" | "B";

export type CCAvenueQuickBillParams = {
  merchantId:    string;
  accessCode:    string;
  workingKey:    string;
  /** Customer-facing name on the invoice */
  customerName:  string;
  customerEmail: string;   // required when deliveryType includes Email
  customerMobile: string;  // required when deliveryType includes SMS
  referenceNo:   string;   // your unique reference (shown in CCAvenue dashboard)
  amount:        string;   // e.g. "250.00"
  currency:      string;   // e.g. "AED"
  deliveryType:  CCAvenueDeliveryType;
  description:   string;
  emailSubject?: string;
  validFor?:     number;   // default 10
  validPeriod?:  "days" | "hours" | "minutes"; // default "days"
  termsAndConditions?: string;
  /**
   * CCAvenue MARS API base URL.
   * UAE merchants: https://api.ccavenue.ae/apis/servlet/DoWebTrans
   * India merchants: https://api.ccavenue.com/apis/servlet/DoWebTrans
   * ⚠️ Confirm with CCAvenue support if unsure.
   */
  apiUrl: string;
};

export type CCAvenueQuickBillResult = {
  invoiceId:   string;
  tinyUrl:     string;   // short payment link — send this to customer
  qrCode?:     string;   // base64 QR code image
  referenceNo: string;
};

// ── Build CCAvenue hosted checkout URL (existing payment gateway flow) ────

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

// ── CCAvenue Quick Bill / Quick Invoice API (MARS API v1.2) ───────────────

/**
 * Creates a Quick Invoice via CCAvenue's MARS API.
 * CCAvenue handles delivery (email / SMS / both) on their end.
 * Returns the short pay_link (tiny_url) to send to the customer via WhatsApp.
 *
 * ⚠️  Before first use, the portal server's IP must be whitelisted in the
 *      CCAvenue MARS dashboard → Settings → API Keys.
 *
 * Ref: CCAvenue Merchant API v1.2 (server-to-server, AES-128-CBC encrypted)
 */
export async function createCCAvenueQuickBill(
  params: CCAvenueQuickBillParams,
): Promise<CCAvenueQuickBillResult> {
  const payload: Record<string, string | number> = {
    merchant_id:        params.merchantId,
    bill_to_name:       params.customerName,
    bill_to_email:      params.customerEmail,
    bill_to_mobile:     params.customerMobile,
    reference_no:       params.referenceNo,
    amount:             params.amount,
    currency:           params.currency,
    billing_type:       params.deliveryType,
    description:        params.description,
    email_subject:      params.emailSubject ?? params.description,
    valid_for:          params.validFor ?? 10,
    valid_type:         params.validPeriod ?? "days",
    terms_and_conditions: params.termsAndConditions ?? "",
  };

  const encRequest = encrypt(JSON.stringify(payload), params.workingKey);

  const body = new URLSearchParams({
    request_type:  "JSON",
    response_type: "JSON",
    version:       "1.2",
    // ⚠️ Confirm exact command name with CCAvenue support if calls fail.
    // Common values: generateQuickBill | generateBill | createBill
    command:       "generateQuickBill",
    access_code:   params.accessCode,
    enc_request:   encRequest,
  });

  const res = await fetch(params.apiUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    throw new Error(`CCAvenue API HTTP error: ${res.status}`);
  }

  const outer = await res.json() as { enc_response?: string; error?: string };

  if (!outer.enc_response) {
    throw new Error(outer.error ?? "CCAvenue API: empty enc_response");
  }

  let decrypted: string;
  try {
    decrypted = decrypt(outer.enc_response, params.workingKey);
  } catch {
    throw new Error("CCAvenue API: failed to decrypt response");
  }

  const result = JSON.parse(decrypted) as {
    invoice_id?:          string;
    bill_id?:             string;
    tiny_url?:            string;
    pay_link?:            string;
    qr_code?:             string;
    merchant_reference_no?: string;
    error_code?:          string;
    error_desc?:          string;
  };

  if (result.error_code && result.error_code !== "" && result.error_code !== "0") {
    throw new Error(`CCAvenue Quick Bill error ${result.error_code}: ${result.error_desc ?? "Unknown error"}`);
  }

  const tinyUrl = result.tiny_url ?? result.pay_link;
  const invoiceId = result.invoice_id ?? result.bill_id;

  if (!tinyUrl || !invoiceId) {
    throw new Error("CCAvenue API: response missing pay_link or invoice_id");
  }

  return {
    invoiceId,
    tinyUrl,
    qrCode:     result.qr_code,
    referenceNo: result.merchant_reference_no ?? params.referenceNo,
  };
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
