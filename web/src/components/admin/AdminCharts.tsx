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
  SalesPeriodMetric,
} from "@/lib/admin-dashboard/analytics";

interface AdminChartsProps {
  analytics: AdminAnalytics;
  section?: "beforeHeatmap" | "afterHeatmap";
}

type TooltipFormatter = (value: number) => string;

type ChartTooltipProps = Omit<TooltipContentProps, "formatter"> & {
  valueFormatter?: TooltipFormatter;
};

type OrderStatusPieRow = {
  name: string;
  value: number;
  fill: string;
};

const pesoPrefix = "\u20B1";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PH").format(value);
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

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed border-gray-300 px-6 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

function hasSalesTrendData(data: SalesPeriodMetric[]) {
  return data.some((period) => period.grossSales > 0 || period.orderCount > 0);
}

export default function AdminCharts({
  analytics,
  section = "beforeHeatmap",
}: AdminChartsProps) {
  const [salesPeriod, setSalesPeriod] = useState<"day" | "month">("month");
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
  const hasRevenueTrendData = hasSalesTrendData(salesData);
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

  if (section === "beforeHeatmap") {
    return (
      <div className="order-1 grid grid-cols-1 gap-[0.85rem] xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
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
              {hasRevenueTrendData ? (
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
              ) : (
                <ChartEmptyState message="No closed and paid sales to chart yet. Revenue will appear after orders are closed and fully paid." />
              )}
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
    );
  }

  return (
    <>
        <div className="order-4 grid grid-cols-1 gap-[0.85rem] lg:grid-cols-2">
          <div className="rounded-xl border border-gray-300 bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Top Products</h3>
            <p className="mb-6 text-sm text-gray-500">
              Top 5 products ranked by gross sales
            </p>
            <div className="h-[300px]">
              {analytics.topProducts.length > 0 ? (
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
              ) : (
                <ChartEmptyState message="No product sales recorded yet. Top products will appear after closed and paid orders include line items." />
              )}
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
              {analytics.salesByCategory.length > 0 ? (
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
              ) : (
                <ChartEmptyState message="No category sales recorded yet. Categories will appear after closed and paid orders are grouped by product category." />
              )}
            </div>
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
    </>
  );
}
