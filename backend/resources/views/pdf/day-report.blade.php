<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Day-end report {{ $r['date'] }}</title>
<style>
  @page { margin: 24px 28px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #14110f; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 11.5px; margin: 14px 0 4px; border-bottom: 1px solid #999; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 4px; text-align: left; }
  th { background: #f2efe9; font-size: 9px; }
  .r { text-align: right; }
  .muted { color: #555; }
  .demo { border: 1px dashed #b42318; color: #b42318; padding: 5px 8px; margin-bottom: 8px; font-weight: bold; text-align: center; }
  .cols td { vertical-align: top; width: 50%; padding-right: 14px; }
</style>
</head>
<body>
@if ($demo)<div class="demo">DEMO BUSINESS — sample data</div>@endif
<h1>Day-end report · {{ $r['business']['name'] }}</h1>
<div class="muted">{{ $dateLabel }} @if ($r['business']['gstin']) · GSTIN {{ $r['business']['gstin'] }} @endif · printed {{ $printed }}</div>

<table class="cols"><tr><td>
<h2>Bills</h2>
<table>
  <tr><td>Bills issued</td><td class="r">{{ $r['bills']['count'] }}@if ($r['bills']['first']) ({{ $r['bills']['first'] }} – {{ $r['bills']['last'] }})@endif</td></tr>
  <tr><td>Items</td><td class="r">₹{{ $r['bills']['items_total'] }}</td></tr>
  <tr><td>Discounts</td><td class="r">− ₹{{ $r['bills']['discount'] }}</td></tr>
  <tr><td>Taxable value</td><td class="r">₹{{ $r['bills']['taxable_value'] }}</td></tr>
  <tr><td>CGST</td><td class="r">₹{{ $r['bills']['cgst'] }}</td></tr>
  <tr><td>SGST</td><td class="r">₹{{ $r['bills']['sgst'] }}</td></tr>
  <tr><td>Packaging / delivery</td><td class="r">₹{{ $r['bills']['charges'] }}</td></tr>
  <tr><td>Round off</td><td class="r">₹{{ $r['bills']['round_off'] }}</td></tr>
  <tr><td><strong>Total billed</strong></td><td class="r"><strong>₹{{ $r['bills']['total'] }}</strong></td></tr>
  <tr><td class="muted">Cancelled bills</td><td class="r muted">{{ $r['bills']['voided'] }}</td></tr>
</table>
<h2>Money received (bills)</h2>
<table>
  @forelse ($r['payments'] as $p)
    <tr><td>{{ strtoupper($p['mode']) }} ({{ $p['count'] }})</td><td class="r">₹{{ $p['amount'] }}</td></tr>
  @empty
    <tr><td class="muted" colspan="2">None</td></tr>
  @endforelse
</table>
@if (count($r['outside_bills']))
<h2>Paid without a bill</h2>
<table>
  @foreach ($r['outside_bills'] as $p)
    <tr><td>{{ ['online' => 'Online', 'cod' => 'Cash on delivery', 'counter' => 'At the counter'][$p['method']] ?? $p['method'] }} ({{ $p['count'] }})</td><td class="r">₹{{ $p['amount'] }}</td></tr>
  @endforeach
</table>
@endif
</td><td>
<h2>Orders</h2>
<table>
  <tr><td>Orders</td><td class="r">{{ $r['orders']['count'] }} · ₹{{ $r['orders']['value'] }}</td></tr>
  <tr><td>Average order</td><td class="r">₹{{ $r['orders']['average'] }}</td></tr>
  @foreach ($r['orders']['by_type'] as $t)
    <tr><td class="muted">{{ str_replace('_', ' ', ucfirst($t['key'])) }}</td><td class="r muted">{{ $t['count'] }} · ₹{{ $t['amount'] }}</td></tr>
  @endforeach
  <tr><td>Cancelled</td><td class="r">{{ $r['orders']['cancelled']['count'] }} · ₹{{ $r['orders']['cancelled']['amount'] }}</td></tr>
</table>
<h2>Cash drawer</h2>
<table>
  <tr><td>Opening cash</td><td class="r">₹{{ $r['cash']['opening'] }}</td></tr>
  <tr><td>Cash from bills</td><td class="r">₹{{ $r['cash']['from_bills'] }}</td></tr>
  <tr><td>Cash orders without a bill</td><td class="r">₹{{ $r['cash']['outside_bills'] }}</td></tr>
  @if ((float) ($r['cash']['gift_cards'] ?? 0) > 0)
    <tr><td>Cash for gift cards sold</td><td class="r">₹{{ $r['cash']['gift_cards'] }}</td></tr>
  @endif
  @if ((float) ($r['cash']['hotel'] ?? 0) != 0)
    <tr><td>Hotel stays (advances, payments, refunds) in cash</td><td class="r">₹{{ $r['cash']['hotel'] }}</td></tr>
  @endif
  <tr><td><strong>Expected in drawer</strong></td><td class="r"><strong>₹{{ $r['cash']['expected'] }}</strong></td></tr>
  @if ($r['closing'])
    <tr><td>Counted</td><td class="r">₹{{ $r['closing']['counted_cash'] }}</td></tr>
    <tr><td><strong>Difference</strong></td><td class="r"><strong>₹{{ $r['closing']['difference'] }}</strong></td></tr>
    @if ($r['closing']['notes'])<tr><td colspan="2" class="muted">{{ $r['closing']['notes'] }}</td></tr>@endif
  @else
    <tr><td colspan="2" class="muted">Day not closed yet.</td></tr>
  @endif
</table>
</td></tr></table>

<h2>Top dishes</h2>
<table>
  <tr><th>Dish</th><th class="r">Qty</th><th class="r">Amount</th></tr>
  @forelse ($r['top_items'] as $i)
    <tr><td>{{ $i['name'] }}</td><td class="r">{{ $i['quantity'] }}</td><td class="r">₹{{ $i['amount'] }}</td></tr>
  @empty
    <tr><td colspan="3" class="muted">No orders.</td></tr>
  @endforelse
</table>
@if ($r['open']['tables'] || $r['open']['unbilled_orders'] || $r['open']['unpaid_bills'])
  <p class="muted" style="margin-top:12px">Still open when printed: {{ $r['open']['tables'] }} table(s), {{ $r['open']['unbilled_orders'] }} unbilled order(s), {{ $r['open']['unpaid_bills'] }} unpaid bill(s).</p>
@endif
</body>
</html>
