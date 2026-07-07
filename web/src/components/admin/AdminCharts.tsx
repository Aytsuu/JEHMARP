import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import type { AdminAnalytics } from "@/lib/admin-dashboard/analytics";

interface AdminChartsProps {
  analytics: AdminAnalytics;
}

type TooltipFormatter = (value: number) => string;

type ChartTooltipProps = Omit<TooltipContentProps, "formatter"> & {
  valueFormatter?: TooltipFormatter;
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

function DefaultTooltip(props: TooltipContentProps) {
  return <CustomTooltipContent {...props} />;
}

function CurrencyTooltip(props: TooltipContentProps) {
  return <CustomTooltipContent {...props} valueFormatter={formatCurrency} />;
}

export default function AdminCharts({ analytics }: AdminChartsProps) {
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
    <div className="space-y-6">
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
              className={`chart-tab-btn ${
                salesPeriod === "month"
                  ? "active shadow-sm"
                  : "!text-gray-600 hover:!text-gray-900 hover:bg-gray-200/50"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setSalesPeriod("day")}
              className={`chart-tab-btn ${
                salesPeriod === "day"
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

      <div className="rounded-xl border border-gray-300 bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-gray-900">Recent Customers</h3>
        <p className="mb-4 text-sm text-gray-500">
          Latest 5 registered customer accounts
        </p>
        <div className="table-wrap">
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
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          customer.is_reseller
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
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    No recent customers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-300 bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-gray-900">
          Status Distribution
        </h3>
        <p className="mb-6 text-sm text-gray-500">
          Distribution of orders by order status and payment status
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-4 text-center text-sm font-semibold text-gray-700">
              Orders By Status
            </h4>
            <div className="flex h-[280px] items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  data={analytics.ordersByStatus}
                >
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={10}
                    tickFormatter={(value: string) =>
                      value.charAt(0).toUpperCase() + value.slice(1)
                    }
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, "auto"]}
                    stroke="#9ca3af"
                    fontSize={9}
                  />
                  <Radar
                    name="Orders Count"
                    dataKey="count"
                    stroke={colors.brandRed}
                    fill={colors.brandRed}
                    fillOpacity={0.4}
                  />
                  <Tooltip content={DefaultTooltip} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-center text-sm font-semibold text-gray-700">
              Payments By Status
            </h4>
            <div className="flex h-[280px] items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  data={analytics.paymentsByStatus}
                >
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={10}
                    tickFormatter={(value: string) =>
                      value.charAt(0).toUpperCase() + value.slice(1)
                    }
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, "auto"]}
                    stroke="#9ca3af"
                    fontSize={9}
                  />
                  <Radar
                    name="Payments Count"
                    dataKey="count"
                    stroke={colors.brandGold}
                    fill={colors.brandGold}
                    fillOpacity={0.4}
                  />
                  <Tooltip content={DefaultTooltip} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

      <div className="rounded-xl border border-gray-300 bg-white p-6">
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
                  className={`w-full cursor-pointer truncate px-2 py-1.5 text-left text-sm font-semibold transition-all !justify-start ${
                    selectedAgentLabel === agent.label
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
