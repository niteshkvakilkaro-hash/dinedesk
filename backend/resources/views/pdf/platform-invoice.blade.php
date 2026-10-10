<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ $i->number }}</title>
<style>
  @page { margin: 26px 30px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #14110f; }
  h1 { font-size: 15px; margin: 0; letter-spacing: 1px; }
  .muted { color: #555; }
  table { width: 100%; border-collapse: collapse; }
  .head td { vertical-align: top; }
  .lines { margin-top: 14px; }
  .lines th { background: #f2efe9; text-align: left; font-size: 9px; padding: 5px 4px; border-bottom: 1px solid #999; }
  .lines td { padding: 6px 4px; border-bottom: 1px solid #e3ddd2; }
  .r { text-align: right; }
  .totals { width: 50%; margin-left: 50%; margin-top: 8px; }
  .totals td { padding: 3px 4px; }
  .grand td { font-size: 12px; font-weight: bold; border-top: 1.5px solid #14110f; padding-top: 6px; }
  .box { border: 1px solid #ccc; padding: 6px 8px; margin-top: 10px; }
  .foot { margin-top: 16px; font-size: 8.5px; color: #555; }
</style>
</head>
<body>
@php($s = $i->seller)
@php($b = $i->buyer)
<table class="head">
  <tr>
    <td>
      <h1>{{ $s['gstin'] ? 'TAX INVOICE' : 'INVOICE' }}</h1>
      @if ($s['legal_name'])<div><strong>{{ $s['legal_name'] }}</strong></div>@endif
      @if ($s['address'])<div>{{ $s['address'] }}</div>@endif
      @if ($s['gstin'])<div>GSTIN {{ $s['gstin'] }}</div>@endif
      @if ($s['email'] || $s['phone'])<div class="muted">{{ implode(' · ', array_filter([$s['email'], $s['phone']])) }}</div>@endif
    </td>
    <td class="r">
      <div><strong>Invoice no.:</strong> {{ $i->number }}</div>
      <div><strong>Date:</strong> {{ $issued }}</div>
      <div class="muted">Place of supply: {{ (float) $i->igst > 0 ? 'inter-state (IGST)' : 'intra-state (CGST + SGST)' }}</div>
    </td>
  </tr>
</table>

<div class="box">
  <strong>Bill to:</strong> {{ $b['name'] }}@if (! empty($b['city'])), {{ $b['city'] }}@endif
  @if (! empty($b['gstin'])) · GSTIN {{ $b['gstin'] }}@endif
  @if (! empty($b['email'])) · {{ $b['email'] }}@endif
</div>

<table class="lines">
  <tr><th>Description</th><th>SAC</th><th class="r">Taxable value</th><th class="r">GST</th><th class="r">Amount</th></tr>
  <tr>
    <td>Subscription: {{ ucfirst($i->plan_code) }} plan, {{ $i->billing_cycle }}@if ($i->period_start)<br><span class="muted">{{ \Carbon\Carbon::parse($i->period_start)->format('d M Y') }} – {{ \Carbon\Carbon::parse($i->period_end)->format('d M Y') }}</span>@endif</td>
    <td>{{ $i->sac }}</td>
    <td class="r">{{ $money($i->taxable_value) }}</td>
    <td class="r">{{ (float) $i->gst_rate > 0 ? rtrim(rtrim($i->gst_rate, '0'), '.').'%' : '—' }}</td>
    <td class="r">{{ $money($i->total) }}</td>
  </tr>
</table>

<table class="totals">
  <tr><td>Taxable value</td><td class="r">{{ $money($i->taxable_value) }}</td></tr>
  @if ((float) $i->cgst > 0)<tr><td>CGST</td><td class="r">{{ $money($i->cgst) }}</td></tr><tr><td>SGST</td><td class="r">{{ $money($i->sgst) }}</td></tr>@endif
  @if ((float) $i->igst > 0)<tr><td>IGST</td><td class="r">{{ $money($i->igst) }}</td></tr>@endif
  <tr class="grand"><td>Total</td><td class="r">₹{{ $money($i->total) }}</td></tr>
  <tr><td colspan="2" class="muted">{{ $words }}</td></tr>
  <tr><td class="muted">Paid · Razorpay</td><td class="r muted">{{ $i->provider_payment_id }}</td></tr>
</table>

<p class="foot">This is a computer-generated invoice.@if (! $s['gstin']) The seller is not registered for GST; no GST is charged.@endif</p>
</body>
</html>
