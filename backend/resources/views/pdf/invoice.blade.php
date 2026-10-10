<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ $invoice->number }}</title>
<style>
  @page { margin: 22px 26px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #14110f; }
  h1 { font-size: 15px; margin: 0; letter-spacing: 1px; }
  h2 { font-size: 13px; margin: 0 0 2px; }
  .muted { color: #555; }
  .demo { border: 1px dashed #b42318; color: #b42318; padding: 5px 8px; margin-bottom: 8px; font-weight: bold; text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  .head td { vertical-align: top; }
  .lines { margin-top: 10px; }
  .lines th { background: #f2efe9; text-align: left; font-size: 9px; padding: 5px 4px; border-bottom: 1px solid #999; }
  .lines td { padding: 4px; border-bottom: 1px solid #e3ddd2; vertical-align: top; }
  .r { text-align: right; }
  .totals { width: 52%; margin-left: 48%; margin-top: 8px; }
  .totals td { padding: 3px 4px; }
  .grand td { font-size: 12px; font-weight: bold; border-top: 1.5px solid #14110f; padding-top: 6px; }
  .box { border: 1px solid #ccc; padding: 6px 8px; }
  .foot { margin-top: 14px; font-size: 8.5px; color: #555; }
</style>
</head>
<body>
@if ($demo)
  <div class="demo">DEMO BUSINESS — sample data, not a real invoice</div>
@endif
<table class="head">
  <tr>
    <td style="width:60%">
      <h1>{{ $invoice->kind === 'tax_invoice' ? 'TAX INVOICE' : 'BILL' }}</h1>
      <h2 style="margin-top:6px">{{ $invoice->seller['name'] }}</h2>
      @if ($invoice->seller['address'])<div>{{ $invoice->seller['address'] }}</div>@endif
      @if ($invoice->seller['phone'])<div>Phone: {{ $invoice->seller['phone'] }}</div>@endif
      @if ($invoice->seller['gstin'])<div><strong>GSTIN:</strong> {{ $invoice->seller['gstin'] }}</div>@endif
      @if ($invoice->seller['fssai'])<div>FSSAI Lic. No.: {{ $invoice->seller['fssai'] }}</div>@endif
    </td>
    <td class="r">
      <div><strong>{{ $invoice->kind === 'tax_invoice' ? 'Invoice' : 'Bill' }} no.:</strong> {{ $invoice->number }}</div>
      <div><strong>Date:</strong> {{ $issued }}</div>
      @if ($table)<div><strong>Table:</strong> {{ $table }}</div>@endif
      @if ($stay)<div><strong>Stay:</strong> {{ $stay }}</div>@endif
      @if (count($orders))<div><strong>Order{{ count($orders) > 1 ? 's' : '' }}:</strong> {{ implode(', ', array_map(fn ($n) => '#'.$n, $orders)) }}</div>@endif
      <div class="muted">Place of supply: intra-state (CGST + SGST)</div>
    </td>
  </tr>
</table>

@if ($invoice->buyer)
  <div class="box" style="margin-top:8px">
    <strong>Billed to:</strong>
    {{ $invoice->buyer['name'] ?? '' }}
    @if (! empty($invoice->buyer['phone'])) · {{ $invoice->buyer['phone'] }} @endif
    @if (! empty($invoice->buyer['gstin'])) · GSTIN {{ $invoice->buyer['gstin'] }} @endif
  </div>
@endif

<table class="lines">
  <thead>
    <tr>
      <th>#</th><th>Item</th><th>SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Discount</th>
      <th class="r">Taxable</th><th class="r">GST %</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">Amount</th>
    </tr>
  </thead>
  <tbody>
    @foreach ($invoice->lines as $i => $l)
      <tr>
        <td>{{ $i + 1 }}</td>
        <td>{{ $l->description }}</td>
        <td>{{ $l->sac }}</td>
        <td class="r">{{ $l->quantity }}</td>
        <td class="r">{{ $money($l->unit_price) }}</td>
        <td class="r">{{ (float) $l->discount > 0 ? $money($l->discount) : '—' }}</td>
        <td class="r">{{ $money($l->taxable_value) }}</td>
        <td class="r">{{ rtrim(rtrim($l->tax_rate, '0'), '.') }}</td>
        <td class="r">{{ $money($l->cgst) }}</td>
        <td class="r">{{ $money($l->sgst) }}</td>
        <td class="r">{{ $money($l->total) }}</td>
      </tr>
    @endforeach
  </tbody>
</table>

<table class="totals">
  <tr><td>Items</td><td class="r">{{ $money($invoice->items_total) }}</td></tr>
  @if ((float) $invoice->discount > 0)
    <tr><td>Discount{{ $invoice->discount_reason ? ' ('.$invoice->discount_reason.')' : '' }}</td><td class="r">− {{ $money($invoice->discount) }}</td></tr>
  @endif
  <tr><td>Taxable value</td><td class="r">{{ $money($invoice->taxable_value) }}</td></tr>
  <tr><td>CGST</td><td class="r">{{ $money($invoice->cgst) }}</td></tr>
  <tr><td>SGST</td><td class="r">{{ $money($invoice->sgst) }}</td></tr>
  @if ((float) $invoice->charges > 0)
    <tr><td>Packaging / delivery</td><td class="r">{{ $money($invoice->charges) }}</td></tr>
  @endif
  @if ((float) $invoice->round_off != 0)
    <tr><td>Round off</td><td class="r">{{ (float) $invoice->round_off > 0 ? '+' : '−' }} {{ $money(abs((float) $invoice->round_off)) }}</td></tr>
  @endif
  <tr class="grand"><td>Total</td><td class="r">₹{{ $money($invoice->total) }}</td></tr>
  <tr><td colspan="2" class="muted">{{ $words }}</td></tr>
  @foreach ($paid as [$label, $amount])
    <tr><td class="muted">{{ $label }}</td><td class="r muted">{{ $amount }}</td></tr>
  @endforeach
  @if ($invoice->status === 'unpaid')
    <tr><td><strong>Due</strong></td><td class="r"><strong>₹{{ $money((float) $invoice->total - (float) $invoice->paid) }}</strong></td></tr>
  @endif
  @if ($invoice->status === 'void')
    <tr><td colspan="2" style="color:#b42318"><strong>CANCELLED</strong> — {{ $invoice->void_reason }}</td></tr>
  @endif
</table>

<div class="foot">
  @if ($invoice->prices_include_tax)Menu prices include GST; the GST shown is the part of the price that is tax.<br>@endif
  @if ($invoice->kind === 'bill')This business has not added a GSTIN, so this is a bill, not a tax invoice.<br>@endif
  Computer-generated {{ $invoice->kind === 'tax_invoice' ? 'invoice' : 'bill' }}; no signature required. Thank you for dining with us.
</div>
</body>
</html>
