import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieSectorShapeProps } from "recharts/types/polar/Pie";
import type { TooltipContentProps } from "recharts";

import type {
  AdminAnalytics,
  WeeklyProductOrderProductMetric,
} from "@/lib/admin-dashboard/analytics";
import DashboardTableEmptyStateContent from "@/components/dashboard/DashboardTableEmptyStateContent";

interface AdminChartsProps {
  analytics: AdminAnalytics;
}

type TooltipFormatter = (value: number) => string;
type RecentActivityTab = "customers" | "orders" | "inquiries" | "resellers";

type ChartTooltipProps = Omit<TooltipContentProps, "formatter"> & {
  valueFormatter?: TooltipFormatter;
};

type WeeklyProductChartRow = {
  label: string;
  fullLabel: string;
  date: string;
  previousDate: string;
  totalQuantity: number;
  previousTotalQuantity: number;
  quantityDifference: number;
  products: WeeklyProductOrderProductMetric[];
} & Record<string, string | number | WeeklyProductOrderProductMetric[]>;

type OrderStatusPieRow = {
  name: string;
  value: number;
  fill: string;
};

const pesoPrefix = "\u20B1";
const weeklyProductColors = [
  "#661818",
  "#ecb55d",
  "#2563eb",
  "#10b981",
  "#f97316",
  "#7c3aed",
  "#0f766e",
  "#be123c",
];
const recentActivityTabs: { id: RecentActivityTab; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "orders", label: "Orders" },
  { id: "inquiries", label: "Inquiries" },
  { id: "resellers", label: "Reseller Applications" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PH").format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatSignedQuantity(value: number) {
  if (value > 0) return `+${formatQuantity(value)}`;
  if (value < 0) return `-${formatQuantity(Math.abs(value))}`;

  return "0";
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function CustomTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md">
      <p className="mb-1.5 font-semibold text-gray-700">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const value =
            typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          const displayValue = valueFormatter ? valueFormatter(value) : value;

          return (
            <p
              key={`${entry.name ?? "value"}-${index}`}
              className="font-medium"
              style={{ color: entry.color || entry.fill }}
            >
              {entry.name}: {displayValue}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function CurrencyTooltip(props: TooltipContentProps) {
  return <CustomTooltipContent {...props} valueFormatter={formatCurrency} />;
}

function WeeklyProductTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const row = payload[0]?.payload as WeeklyProductChartRow | undefined;

  if (!row) return null;

  return (
    <div className="max-w-[280px] rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md">
      <div className="mb-2">
        <p className="font-semibold text-gray-900">{row.fullLabel}</p>
        <p className="text-xs text-gray-500">
          {formatQuantity(row.totalQuantity)} ordered this week
          {row.quantityDifference !== 0
            ? ` · ${formatSignedQuantity(row.quantityDifference)} vs previous week`
            : ""}
        </p>
      </div>
      {row.products.length > 0 ? (
        <div className="space-y-1">
          {row.products.map((product) => (
            <div
              key={product.productId}
              className="flex items-center justify-between gap-4"
            >
              <span className="truncate text-gray-700">{product.label}</span>
              <span className="shrink-0 font-semibold text-gray-900">
                {formatQuantity(product.currentQuantity)}
                {product.quantityDifference !== 0 && (
                  <small
                    className={`ml-1 font-bold ${product.quantityDifference > 0
                        ? "text-emerald-700"
                        : "text-red-700"
                      }`}
                  >
                    {formatSignedQuantity(product.quantityDifference)}
                  </small>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No products ordered.</p>
      )}
    </div>
  );
}

function TrendArrow({ value }: { value: number }) {
  if (value === 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${value > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        }`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${value < 0 ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </span>
  );
}

function renderOrderStatusPieSector(props: PieSectorShapeProps) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const innerRadius = Number(props.innerRadius ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0);
  const startAngle = Number(props.startAngle ?? 0);
  const endAngle = Number(props.endAngle ?? 0);
  const fill = typeof props.fill === "string" ? props.fill : "#661818";

  if (props.isActive) {
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 10}
          outerRadius={outerRadius + 14}
          fill={fill}
        />
      </g>
    );
  }

  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
    />
  );
}

function OrderStatusTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const row = payload[0]?.payload as OrderStatusPieRow | undefined;

  if (!row) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md">
      <p className="font-semibold text-gray-900">{row.name}</p>
      <p className="mt-1 font-medium text-gray-700">{formatNumber(row.value)} orders</p>
    </div>
  );
}

export default function AdminCharts({ analytics }: AdminChartsProps) {
  const [salesPeriod, setSalesPeriod] = useState<"day" | "month">("month");
  const [recentActivityTab, setRecentActivityTab] =
    useState<RecentActivityTab>("customers");
  const [selectedAgentLabel, setSelectedAgentLabel] = useState<string | null>(
    analytics.salesByAgent.length > 0 ? analytics.salesByAgent[0].label : null,
  );

  const colors = {
    brandRed: "#661818",
    brandGold: "#ecb55d",
    emerald: "#10b981",
    orange: "#f97316",
  };

  const salesData =
    salesPeriod === "day" ? analytics.salesByDay : analytics.salesByMonth;
  const weeklyProductSeries = analytics.weeklyProductOrders.productSeries.map(
    (series, index) => ({
      ...series,
      key: `product_${index}`,
      color: weeklyProductColors[index % weeklyProductColors.length],
    }),
  );
  const weeklyProductChartData: WeeklyProductChartRow[] =
    analytics.weeklyProductOrders.days.map((day) => {
      const productValues = weeklyProductSeries.reduce<Record<string, number>>(
        (values, series) => {
          const product = day.products.find(
            (item) => item.productId === series.productId,
          );

          return {
            ...values,
            [series.key]: product?.currentQuantity ?? 0,
          };
        },
        {},
      );

      return {
        label: day.shortLabel,
        fullLabel: day.label,
        date: day.date,
        previousDate: day.previousDate,
        totalQuantity: day.totalQuantity,
        previousTotalQuantity: day.previousTotalQuantity,
        quantityDifference: day.quantityDifference,
        products: day.products,
        ...productValues,
      };
    });
  const weeklyPeakDay = analytics.weeklyProductOrders.peakDay;
  const orderStatusOverview = analytics.orderStatusOverview;
  const orderStatusPieData: OrderStatusPieRow[] = orderStatusOverview.statuses
    .filter((status) => status.count > 0)
    .map((status) => ({
      name: status.label,
      value: status.count,
      fill: status.color,
    }));

  const selectedAgentData = analytics.salesByAgent.find(
    (agent) => agent.label === selectedAgentLabel,
  );

  const singleAgentChartData = selectedAgentData
    ? [
      {
        name: "Gross Sales",
        amount: selectedAgentData.grossSales,
        fill: colors.brandRed,
      },
      {
        name: "Paid Amount",
        amount: selectedAgentData.paidAmount,
        fill: colors.emerald,
      },
      {
        name: "Commission Earned",
        amount: selectedAgentData.earnedCommission,
        fill: colors.brandGold,
      },
      {
        name: "Expected Commission",
        amount: selectedAgentData.expectedCommission,
        fill: colors.orange,
      },
    ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <>
        <div className="order-1 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
          <div className="rounded-xl border border-gray-300 bg-white p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Revenue & Sales Trend
                </h3>
                <p className="text-sm text-gray-500">
                  Gross order value tracked over time
                </p>
              </div>
              <div className="inline-flex h-fit self-start rounded-lg border border-gray-300 bg-gray-50 p-1 sm:self-auto">
                <button
                  onClick={() => setSalesPeriod("month")}
                  className={`chart-tab-btn ${salesPeriod === "month"
                      ? "active shadow-sm"
                      : "!text-gray-600 hover:!text-gray-900 hover:bg-gray-200/50"
                    }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setSalesPeriod("day")}
                  className={`chart-tab-btn ${salesPeriod === "day"
                      ? "active shadow-sm"
                      : "!text-gray-600 hover:!text-gray-900 hover:bg-gray-200/50"
                    }`}
                >
                  Daily
                </button>
              </div>
            </div>

            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={salesData}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={colors.brandRed}
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="95%"
                        stopColor={colors.brandRed}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${pesoPrefix}${formatNumber(value)}`}
                  />
                  <Tooltip content={CurrencyTooltip} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="grossSales"
                    name="Gross Sales"
                    stroke={colors.brandRed}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorSales)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-gray-300 bg-white p-6">
            <h3 className="text-lg font-bold text-gray-900">Order Status</h3>
            <p className="mt-1 text-sm text-gray-500">
              Distribution across active order stages
            </p>

            <div className="mt-5 flex items-center gap-5">
              <div className="h-[190px] w-[190px] shrink-0">
                {orderStatusPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={orderStatusPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={72}
                        paddingAngle={3}
                        shape={renderOrderStatusPieSector}
                      />
                      <Tooltip content={OrderStatusTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-full border border-dashed border-gray-300 text-sm text-gray-500">
                    No orders yet
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <ul className="space-y-3">
                  {orderStatusOverview.statuses.map((status) => (
                    <li
                      key={status.key}
                      className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: status.color }}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {status.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-lg font-bold tabular-nums text-gray-900">
                        {formatNumber(status.count)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-500">
                  <span className="font-semibold text-gray-900">
                    {formatNumber(orderStatusOverview.totalOrders)}
                  </span>{" "}
                  total order records
                </p>
              </div>
            </div>

            {orderStatusOverview.recentUpdates.length > 0 ? (
              <div className="relative mt-5 border-t border-gray-100 pt-4">
                <ul
                  className="relative space-y-0.5 pb-1"
                  aria-label="Recently updated orders"
                >
                  {orderStatusOverview.recentUpdates.map((update, index) => {
                    const opacity = index === 0 ? 1 : 0.55;

                    return (
                      <li key={update.id} style={{ opacity }}>
                        <a
                          href={update.href}
                          className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm transition-colors hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">
                              {update.orderCode}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {update.partyLabel}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-semibold"
                              style={{ color: update.statusColor }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: update.statusColor }}
                                aria-hidden="true"
                              />
                              {update.statusLabel}
                            </span>
                            <p className="mt-0.5 text-[0.68rem] text-gray-400">
                              {update.updatedLabel}
                            </p>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-white/0 via-white/70 to-white"
                  aria-hidden="true"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="order-3 rounded-xl border border-gray-300 bg-white p-6">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Weekly Product Orders
              </h3>
              <p className="text-sm text-gray-500">
                Product quantities ordered this week compared with the same weekdays last week
              </p>
            </div>
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4 lg:w-[320px]">
              <span className="text-xs font-bold uppercase text-gray-500">
                Peak day this week
              </span>
              <div className="mt-2 flex items-center justify-between gap-4">
                <div>
                  <strong className="block text-xl text-gray-900">
                    {weeklyPeakDay.label}
                  </strong>
                  <span className="text-sm text-gray-500">
                    {formatQuantity(weeklyPeakDay.totalQuantity)} ordered
                  </span>
                </div>
                {weeklyPeakDay.quantityDifference !== 0 && (
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-extrabold ${weeklyPeakDay.quantityDifference > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                      }`}
                  >
                    <TrendArrow value={weeklyPeakDay.quantityDifference} />
                    {formatSignedQuantity(weeklyPeakDay.quantityDifference)}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Compared with {weeklyPeakDay.previousDate}
              </p>
            </div>
          </div>

          {weeklyProductSeries.length > 0 ? (
            <>
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={weeklyProductChartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f3f4f6"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => formatQuantity(value)}
                    />
                    <Tooltip content={WeeklyProductTooltip} />
                    <Legend />
                    {weeklyProductSeries.map((series) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={series.label}
                        stackId="products"
                        fill={series.color}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                {analytics.weeklyProductOrders.days.map((day) => (
                  <div
                    key={day.date}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-700">
                        {day.shortLabel}
                      </span>
                      {day.quantityDifference !== 0 && (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-extrabold ${day.quantityDifference > 0
                              ? "text-emerald-700"
                              : "text-red-700"
                            }`}
                        >
                          <TrendArrow value={day.quantityDifference} />
                          {formatSignedQuantity(day.quantityDifference)}
                        </span>
                      )}
                    </div>
                    <strong className="mt-2 block text-lg text-gray-900">
                      {formatQuantity(day.totalQuantity)}
                    </strong>
                    <span className="text-xs text-gray-500">
                      Previous {formatQuantity(day.previousTotalQuantity)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
              No product orders found for this week or the previous week.
            </div>
          )}
        </div>

        <div className="order-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-300 bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Top Products</h3>
            <p className="mb-6 text-sm text-gray-500">
              Top 5 products ranked by gross sales
            </p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.topProducts}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 30, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke="#9ca3af"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${pesoPrefix}${formatNumber(value)}`}
                  />
                  <YAxis
                    dataKey="label"
                    type="category"
                    stroke="#4b5563"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip content={CurrencyTooltip} />
                  <Bar
                    dataKey="grossSales"
                    name="Sales Value"
                    fill={colors.brandRed}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-gray-300 bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-gray-900">
              Sales by Category
            </h3>
            <p className="mb-6 text-sm text-gray-500">
              Quantity and revenue grouped by category
            </p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.salesByCategory}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${pesoPrefix}${formatNumber(value)}`}
                  />
                  <Tooltip content={CurrencyTooltip} />
                  <Bar
                    dataKey="grossSales"
                    name="Gross Sales"
                    fill={colors.brandGold}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </>

      <div className="order-2 rounded-xl border border-gray-300 bg-white p-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="mb-1 text-lg font-bold text-gray-900">Recent Activity</h3>
            <p className="text-sm text-gray-500">
              Latest customers, orders, inquiries, and reseller applications
            </p>
          </div>
          <div
            className="inline-flex w-fit max-w-full overflow-x-auto rounded-lg border border-gray-300 bg-gray-50 p-1"
            role="tablist"
            aria-label="Recent activity"
          >
            {recentActivityTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={recentActivityTab === tab.id}
                onClick={() => setRecentActivityTab(tab.id)}
                className={`chart-tab-btn whitespace-nowrap ${recentActivityTab === tab.id
                    ? "active shadow-sm"
                    : "!text-gray-600 hover:!text-gray-900 hover:bg-gray-200/50"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          {recentActivityTab === "customers" && (
            <table className="min-w-full">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Type</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentCustomers.length > 0 ? (
                  analytics.recentCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50/50">
                      <td className="font-semibold text-gray-900">
                        {customer.first_name} {customer.last_name}
                      </td>
                      <td className="text-gray-700">
                        {customer.email || (
                          <span className="text-gray-400">No email</span>
                        )}
                      </td>
                      <td className="text-gray-700">{customer.phone_number}</td>
                      <td>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${customer.is_reseller
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                            }`}
                        >
                          {customer.is_reseller ? "Reseller" : "Retail"}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">
                        {formatDate(customer.created_at)}
                      </td>
                      <td>
                        <a
                          href={`/admin/customers/${customer.id}`}
                          className="text-sm font-bold text-[#661818] hover:underline"
                        >
                          View Profile
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <DashboardTableEmptyStateContent message="No recent customers found" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {recentActivityTab === "orders" && (
            <table className="min-w-full">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Order Status</th>
                  <th scope="col">Payment Status</th>
                  <th scope="col">Total</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentOrders.length > 0 ? (
                  analytics.recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/50">
                      <td className="font-semibold text-gray-900">{order.customerName}</td>
                      <td className="capitalize text-gray-700">{order.orderStatus}</td>
                      <td className="capitalize text-gray-700">{order.paymentStatus}</td>
                      <td className="font-semibold text-gray-900">
                        {formatCurrency(order.grossSales)}
                      </td>
                      <td className="text-sm text-gray-500">
                        {formatDate(order.createdAt)}
                      </td>
                      <td>
                        <a
                          href={`/admin/orders/customer/${order.id}`}
                          className="text-sm font-bold text-[#661818] hover:underline"
                        >
                          View Order
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <DashboardTableEmptyStateContent message="No recent orders found" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {recentActivityTab === "inquiries" && (
            <table className="min-w-full">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Status</th>
                  <th scope="col">Received</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentInquiries.length > 0 ? (
                  analytics.recentInquiries.map((inquiry) => (
                    <tr key={inquiry.id} className="hover:bg-gray-50/50">
                      <td className="font-semibold text-gray-900">{inquiry.name}</td>
                      <td className="text-gray-700">{inquiry.email}</td>
                      <td className="text-gray-700">
                        {inquiry.phone_number || (
                          <span className="text-gray-400">No phone</span>
                        )}
                      </td>
                      <td className="capitalize text-gray-700">{inquiry.inquiry_status}</td>
                      <td className="text-sm text-gray-500">
                        {formatDate(inquiry.created_at)}
                      </td>
                      <td>
                        <a
                          href="/admin/inquiries"
                          className="text-sm font-bold text-[#661818] hover:underline"
                        >
                          Review
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <DashboardTableEmptyStateContent message="No recent inquiries found" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {recentActivityTab === "resellers" && (
            <table className="min-w-full">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentResellerApplications.length > 0 ? (
                  analytics.recentResellerApplications.map((application) => (
                    <tr key={application.id} className="hover:bg-gray-50/50">
                      <td className="font-semibold text-gray-900">{application.name}</td>
                      <td className="text-gray-700">{application.email}</td>
                      <td className="text-gray-700">{application.contact_number}</td>
                      <td className="capitalize text-gray-700">
                        {application.application_status}
                      </td>
                      <td className="text-sm text-gray-500">
                        {formatDate(application.created_at)}
                      </td>
                      <td>
                        <a
                          href="/admin/reseller-applications"
                          className="text-sm font-bold text-[#661818] hover:underline"
                        >
                          Review
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <DashboardTableEmptyStateContent message="No recent reseller applications found" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="order-5 rounded-xl border border-gray-300 bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-gray-900">
          Agent Performance
        </h3>
        <p className="mb-6 text-sm text-gray-500">
          Comparison of individual agent financial and commission metrics
        </p>

        <div className="mt-4 flex flex-col gap-6 md:flex-row">
          <div className="max-h-[350px] w-full space-y-1 overflow-y-auto border-r border-gray-200 pr-0 md:w-64 md:pr-6">
            <span className="mb-2 block px-2 text-xs font-bold uppercase tracking-wider text-gray-400">
              Agents
            </span>
            {analytics.salesByAgent.length > 0 ? (
              analytics.salesByAgent.map((agent) => (
                <button
                  key={agent.label}
                  onClick={() => setSelectedAgentLabel(agent.label)}
                  className={`w-full cursor-pointer truncate px-2 py-1.5 text-left text-sm font-semibold transition-all !justify-start ${selectedAgentLabel === agent.label
                      ? "text-[#661818] underline"
                      : "text-gray-600 hover:text-[#661818]"
                    }`}
                  style={{
                    transform: "none",
                    background: "none",
                    border: "none",
                    justifyContent: "flex-start",
                  }}
                >
                  {agent.label}
                </button>
              ))
            ) : (
              <span className="block px-2 text-xs text-gray-500">
                No agents found
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {selectedAgentData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-md font-bold text-gray-900">
                    Performance Details:{" "}
                    <span className="font-extrabold text-[#661818]">
                      {selectedAgentLabel}
                    </span>
                  </h4>
                  <div className="text-xs text-gray-500">
                    Total Orders:{" "}
                    <span className="font-semibold text-gray-900">
                      {selectedAgentData.orderCount}
                    </span>
                  </div>
                </div>

                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={singleAgentChartData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f3f4f6"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => `${pesoPrefix}${formatNumber(value)}`}
                      />
                      <Tooltip content={CurrencyTooltip} />
                      <Bar dataKey="amount" name="Value" radius={[4, 4, 0, 0]}>
                        {singleAgentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center py-12 text-sm text-gray-400">
                Select an agent on the left to view their performance metrics.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
