<?php
/**
 * FABRIOZA Form Handler
 * Handles all form submissions and sends auto-responses
 * Upload to /public_html/api/ on cPanel
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed']); exit; }

$data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
if (empty($data)) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'No data received']); exit; }

// Forward a copy of the submission to the CRM (best-effort, server-side).
// The CRM secret never leaves the server. Configured via container env:
//   CRM_FORM_URL=http://crm:3000/api/leads/form   FORM_INTAKE_SECRET=<secret>
$crmUrl = getenv('CRM_FORM_URL');
$crmKey = getenv('FORM_INTAKE_SECRET');
if ($crmUrl && $crmKey) {
    $payload = json_encode($data);
    if (function_exists('curl_init')) {
        $ch = curl_init($crmUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'x-api-key: ' . $crmKey]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        @curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\nx-api-key: " . $crmKey . "\r\n",
            'content' => $payload,
            'timeout' => 5,
        ]]);
        @file_get_contents($crmUrl, false, $ctx);
    }
}

$TO_EMAIL = 'info@fabrioza.com';
$FROM_EMAIL = 'noreply@fabrioza.com';
$REPLY_TO = 'info@fabrioza.com';

$clientEmail = sanitize($data['email'] ?? '');
$clientName = sanitize($data['name'] ?? '');
$formType = sanitize($data['form_type'] ?? 'General Inquiry');
$company = sanitize($data['company'] ?? '');
$productType = sanitize($data['product_type'] ?? '');
$quantity = sanitize($data['quantity'] ?? '');
$message = sanitize($data['message'] ?? '');
$source = sanitize($data['source'] ?? '');

if (empty($clientEmail)) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Email is required']); exit; }

// 1. Send notification to info@fabrioza.com
$notifSubject = "New Lead: $formType - $clientName";
$notifBody = "<!DOCTYPE html>
<html><head><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:#4A7C59;color:white;padding:20px;text-align:center}
.content{background:#f9f9f9;padding:20px;border:1px solid #ddd}
.field{margin-bottom:15px}
.label{font-weight:bold;color:#4A7C59}
.footer{text-align:center;padding:20px;color:#999;font-size:12px}
</style></head><body>
<div class='container'>
<div class='header'><h2>New Lead from FABRIOZA Website</h2></div>
<div class='content'>
<div class='field'><div class='label'>Form Type:</div><div>" . h($formType) . "</div></div>
<div class='field'><div class='label'>Name:</div><div>" . h($clientName) . "</div></div>
<div class='field'><div class='label'>Email:</div><div>" . h($clientEmail) . "</div></div>
<div class='field'><div class='label'>Company:</div><div>" . h($company) . "</div></div>
<div class='field'><div class='label'>Product Type:</div><div>" . h($productType) . "</div></div>
<div class='field'><div class='label'>Quantity:</div><div>" . h($quantity) . "</div></div>
<div class='field'><div class='label'>Message:</div><div>" . nl2br(h($message)) . "</div></div>
<div class='field'><div class='label'>Source:</div><div>" . h($source) . "</div></div>
<div class='field'><div class='label'>Date:</div><div>" . date('Y-m-d H:i:s') . "</div></div>
</div>
<div class='footer'><p>This email was sent from your FABRIOZA website form handler.</p></div>
</div></body></html>";

$notifHeaders = "From: $FROM_EMAIL\r\n";
$notifHeaders .= "Reply-To: $REPLY_TO\r\n";
$notifHeaders .= "Content-Type: text/html; charset=UTF-8\r\n";
$notifHeaders .= "X-Mailer: FABRIOZA Form Handler";

$notifSent = mail($TO_EMAIL, $notifSubject, $notifBody, $notifHeaders);

// 2. Send auto-responder to client
$autoReplySubject = "Thank you for contacting FABRIOZA - We will respond within 24 hours";
$autoReplyBody = getAutoReplyTemplate($clientName, $formType);

$autoHeaders = "From: FABRIOZA <$FROM_EMAIL>\r\n";
$autoHeaders .= "Reply-To: $REPLY_TO\r\n";
$autoHeaders .= "Content-Type: text/html; charset=UTF-8\r\n";

$autoSent = mail($clientEmail, $autoReplySubject, $autoReplyBody, $autoHeaders);

if ($notifSent || $autoSent) {
    echo json_encode(['success' => true, 'message' => 'Thank you! We will get back to you within 24 hours.']);
} else {
    // Fallback: try with -f parameter
    $notifSent2 = mail($TO_EMAIL, $notifSubject, $notifBody, $notifHeaders, "-f$FROM_EMAIL");
    if ($notifSent2) {
        echo json_encode(['success' => true, 'message' => 'Thank you! We will get back to you within 24 hours.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Unable to send email. Please try again or contact us directly at info@fabrioza.com']);
    }
}

function sanitize($str) {
    return htmlspecialchars(strip_tags(trim($str)), ENT_QUOTES, 'UTF-8');
}
function h($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

function getAutoReplyTemplate($name, $formType) {
    $firstName = explode(' ', $name)[0] ?: 'there';
    return "<!DOCTYPE html>
<html><head><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:#4A7C59;color:white;padding:30px 20px;text-align:center}
.header h1{margin:0;font-size:24px}
.content{background:#fff;padding:30px 20px;border:1px solid #ddd}
.cta{background:#4A7C59;color:white;padding:15px;text-align:center;margin:20px 0;border-radius:5px}
.cta a{color:white;text-decoration:none;font-weight:bold}
.features{background:#f5f5f5;padding:20px;margin:20px 0;border-radius:5px}
.feature{margin-bottom:10px;padding-left:25px;position:relative}
.feature::before{content:'\2713';position:absolute;left:0;color:#4A7C59;font-weight:bold}
.footer{text-align:center;padding:20px;color:#999;font-size:12px;border-top:1px solid #eee}
</style></head><body>
<div class='container'>
<div class='header'>
<h1>FABRIOZA</h1>
<p>Premium Private Label Clothing Manufacturer</p>
</div>
<div class='content'>
<p>Hi $firstName,</p>
<p>Thank you for reaching out to FABRIOZA! We've received your inquiry and a member of our team will personally respond within <strong>24 hours</strong>.</p>
<div class='features'>
<div class='feature'>MOQ starts at just <strong>50 pieces</strong></div>
<div class='feature'>Free design mockups within 24-48 hours</div>
<div class='feature'>Sample production in 5-7 business days</div>
<div class='feature'>Factory-direct pricing (save 30-50%)</div>
<div class='feature'>ISO 9001, BSCI, OEKO-TEX certified</div>
</div>
<div class='cta'>
<a href='https://calendly.com/fabrioza/30min'>Book a Free 30-Minute Consultation</a>
</div>
<p>In the meantime, feel free to explore our website or book a meeting directly using the link above.</p>
<p>Best regards,<br><strong>The FABRIOZA Team</strong></p>
<p style='font-size:12px;color:#666'>USA Office: 157 Everett Sq, McDonough, GA 30252<br>Email: info@fabrioza.com</p>
</div>
<div class='footer'>
<p>This is an automated response. Please do not reply to this email.</p>
<p>&copy; 2025 FABRIOZA. All rights reserved.</p>
</div>
</div></body></html>";
}
