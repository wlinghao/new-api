/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildUserUsageSummaryExportUrl,
  getUserUsageModelSummary,
  getUserUsageSummary,
  refreshUserUsageSummary,
} from '@/features/dashboard/api'
import type {
  UserUsageModelSummaryItem,
  UserUsageSummaryItem,
} from '@/features/dashboard/types'
import { formatNumber, formatQuota } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 20

function toDateInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function defaultStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 29)
  return toDateInput(date)
}

function formatDateFromUnix(seconds: number) {
  if (!seconds) return '-'
  return toDateInput(new Date(seconds * 1000))
}

function formatTokensMillion(tokens: number) {
  return `${Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
  }).format(tokens / 1_000_000)}M`
}

function StatTile(props: { label: string; value: string; sub?: string }) {
  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle className='text-muted-foreground text-xs font-normal'>
          {props.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-xl font-semibold tabular-nums'>{props.value}</div>
        {props.sub && (
          <div className='text-muted-foreground mt-1 text-xs'>{props.sub}</div>
        )}
      </CardContent>
    </Card>
  )
}

function ModelUsageDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserUsageSummaryItem | null
  startDate: string
  endDate: string
}) {
  const { t } = useTranslation()
  const enabled = props.open && props.user != null
  const query = useQuery({
    queryKey: [
      'user-usage-model-summary',
      props.user?.user_id,
      props.startDate,
      props.endDate,
    ],
    enabled,
    queryFn: async () => {
      if (!props.user) return []
      const res = await getUserUsageModelSummary(props.user.user_id, {
        start_date: props.startDate,
        end_date: props.endDate,
      })
      return res.data ?? []
    },
  })
  const rows = query.data ?? []

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Model usage details')} · {props.user?.username ?? '-'}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Aggregated from daily usage statistics for the selected date range.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[65vh] overflow-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Model')}</TableHead>
                <TableHead>{t('Active Days')}</TableHead>
                <TableHead>{t('Requests')}</TableHead>
                <TableHead>{t('Input Tokens')}</TableHead>
                <TableHead>{t('Output Tokens')}</TableHead>
                <TableHead>{t('Average Input Tokens')}</TableHead>
                <TableHead>{t('Average Output Tokens')}</TableHead>
                <TableHead>{t('Total Cost')}</TableHead>
                <TableHead>{t('Average Daily Cost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className='h-7 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length > 0 ? (
                rows.map((row: UserUsageModelSummaryItem) => (
                  <TableRow key={row.model_name || 'unknown'}>
                    <TableCell className='font-medium'>
                      {row.model_name || t('Unknown')}
                    </TableCell>
                    <TableCell>{formatNumber(row.active_days)}</TableCell>
                    <TableCell>{formatNumber(row.request_count)}</TableCell>
                    <TableCell>{formatTokensMillion(row.prompt_tokens)}</TableCell>
                    <TableCell>
                      {formatTokensMillion(row.completion_tokens)}
                    </TableCell>
                    <TableCell>
                      {formatTokensMillion(row.avg_prompt_tokens_per_day)}
                    </TableCell>
                    <TableCell>
                      {formatTokensMillion(row.avg_completion_tokens_per_day)}
                    </TableCell>
                    <TableCell>{formatQuota(row.quota)}</TableCell>
                    <TableCell>{formatQuota(row.avg_quota_per_day)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className='text-muted-foreground h-20 text-center'
                  >
                    {t('No usage statistics found')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function UserUsageStatistics() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(() => toDateInput(new Date()))
  const [username, setUsername] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<UserUsageSummaryItem | null>(
    null
  )

  const queryParams = {
    start_date: startDate,
    end_date: endDate,
    username: username.trim() || undefined,
    p: page,
    page_size: PAGE_SIZE,
  }

  const usageQuery = useQuery({
    queryKey: ['user-usage-summary', queryParams],
    queryFn: () => getUserUsageSummary(queryParams),
  })

  const refreshMutation = useMutation({
    mutationFn: refreshUserUsageSummary,
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Failed to update usage statistics'))
        return
      }
      toast.success(
        t('Usage statistics updated: {{dates}} days, {{rows}} rows', {
          dates: res.data.processed_dates,
          rows: res.data.rows_written,
        })
      )
      void queryClient.invalidateQueries({ queryKey: ['user-usage-summary'] })
      void queryClient.invalidateQueries({
        queryKey: ['user-usage-model-summary'],
      })
    },
  })

  const rows = usageQuery.data?.data?.items ?? []
  const total = usageQuery.data?.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.prompt += row.prompt_tokens
          acc.completion += row.completion_tokens
          acc.quota += row.quota
          acc.requests += row.request_count
          return acc
        },
        { prompt: 0, completion: 0, quota: 0, requests: 0 }
      ),
    [rows]
  )

  const resetToFirstPage = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const exportCsv = () => {
    window.location.assign(
      buildUserUsageSummaryExportUrl({
        start_date: startDate,
        end_date: endDate,
        username: username.trim() || undefined,
      })
    )
  }

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <StatTile
          label={t('Users in current page')}
          value={formatNumber(rows.length)}
          sub={t('{{total}} users matched', { total: formatNumber(total) })}
        />
        <StatTile label={t('Requests')} value={formatNumber(totals.requests)} />
        <StatTile
          label={t('Input Tokens')}
          value={formatTokensMillion(totals.prompt)}
        />
        <StatTile label={t('Total Cost')} value={formatQuota(totals.quota)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Usage Statistics')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-2 md:grid-cols-[180px_180px_minmax(180px,1fr)_auto]'>
            <Input
              type='date'
              value={startDate}
              onChange={(event) =>
                resetToFirstPage(() => setStartDate(event.target.value))
              }
              aria-label={t('Start Date')}
            />
            <Input
              type='date'
              value={endDate}
              onChange={(event) =>
                resetToFirstPage(() => setEndDate(event.target.value))
              }
              aria-label={t('End Date')}
            />
            <Input
              value={username}
              onChange={(event) =>
                resetToFirstPage(() => setUsername(event.target.value))
              }
              placeholder={t('Filter by username')}
            />
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                onClick={() =>
                  refreshMutation.mutate({
                    start_date: startDate,
                    end_date: endDate,
                    mode: 'missing',
                  })
                }
                disabled={refreshMutation.isPending}
              >
                {t('Update Missing Days')}
              </Button>
              <Button
                variant='outline'
                onClick={() => refreshMutation.mutate({ mode: 'today' })}
                disabled={refreshMutation.isPending}
              >
                {t('Refresh Today')}
              </Button>
              <Button variant='secondary' onClick={exportCsv}>
                {t('Export CSV')}
              </Button>
            </div>
          </div>

          <div className='overflow-hidden rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Username')}</TableHead>
                  <TableHead>{t('Active Days')}</TableHead>
                  <TableHead>{t('Requests')}</TableHead>
                  <TableHead>{t('Input Tokens')}</TableHead>
                  <TableHead>{t('Output Tokens')}</TableHead>
                  <TableHead>{t('Average Input Tokens')}</TableHead>
                  <TableHead>{t('Average Output Tokens')}</TableHead>
                  <TableHead>{t('Total Cost')}</TableHead>
                  <TableHead>{t('Average Daily Cost')}</TableHead>
                  <TableHead>{t('Start Date')}</TableHead>
                  <TableHead>{t('End Date')}</TableHead>
                  <TableHead>{t('Details')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={12}>
                        <Skeleton className='h-8 w-full' />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length > 0 ? (
                  rows.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell className='font-medium'>
                        {row.username || `#${row.user_id}`}
                      </TableCell>
                      <TableCell>{formatNumber(row.active_days)}</TableCell>
                      <TableCell>{formatNumber(row.request_count)}</TableCell>
                      <TableCell>{formatTokensMillion(row.prompt_tokens)}</TableCell>
                      <TableCell>
                        {formatTokensMillion(row.completion_tokens)}
                      </TableCell>
                      <TableCell>
                        {formatTokensMillion(row.avg_prompt_tokens_per_day)}
                      </TableCell>
                      <TableCell>
                        {formatTokensMillion(row.avg_completion_tokens_per_day)}
                      </TableCell>
                      <TableCell>{formatQuota(row.quota)}</TableCell>
                      <TableCell>
                        {formatQuota(row.avg_quota_per_day)}
                      </TableCell>
                      <TableCell>
                        {formatDateFromUnix(row.first_date)}
                      </TableCell>
                      <TableCell>
                        {formatDateFromUnix(row.last_date)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setSelectedUser(row)}
                        >
                          {t('View Models')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className='text-muted-foreground h-28 text-center'
                    >
                      {t('No usage statistics found')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='text-muted-foreground text-sm'>
              {t('Page {{page}} of {{totalPages}}', { page, totalPages })}
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                disabled={page <= 1 || usageQuery.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('Previous')}
              </Button>
              <Button
                variant='outline'
                disabled={page >= totalPages || usageQuery.isFetching}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                {t('Next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ModelUsageDialog
        open={selectedUser != null}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        user={selectedUser}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  )
}
