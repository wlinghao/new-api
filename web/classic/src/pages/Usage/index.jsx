/*
Copyright (C) 2025 QuantumNous

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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Pagination,
  Space,
  Table,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, renderQuota, showError, showSuccess } from '../../helpers';

const { Text, Title } = Typography;

const PAGE_SIZE = 20;

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return formatDateInput(date);
}

function formatUnixDate(timestamp) {
  if (!timestamp) return '-';
  return formatDateInput(new Date(timestamp * 1000));
}

function formatNumber(value, digits = 0) {
  const number = Number(value) || 0;
  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatTokensMillion(value) {
  return `${((Number(value) || 0) / 1000000).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })}M`;
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function Usage() {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [username, setUsername] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modelRows, setModelRows] = useState([]);
  const [modelLoading, setModelLoading] = useState(false);

  const queryParams = useMemo(
    () => ({
      start_date: startDate,
      end_date: endDate,
      username: username.trim() || undefined,
      p: page,
      page_size: PAGE_SIZE,
    }),
    [endDate, page, startDate, username],
  );

  const loadUsage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/usage/summary', {
        params: queryParams,
      });
      if (!res.data.success) {
        showError(res.data.message || t('加载使用量统计失败'));
        return;
      }
      setRows(res.data.data?.items || []);
      setTotal(res.data.data?.total || 0);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [queryParams, t]);

  const loadModelUsage = useCallback(
    async (user) => {
      setSelectedUser(user);
      setModelModalVisible(true);
      setModelLoading(true);
      try {
        const res = await API.get(
          `/api/usage/summary/users/${user.user_id}/models`,
          {
            params: {
              start_date: startDate,
              end_date: endDate,
            },
          },
        );
        if (!res.data.success) {
          showError(res.data.message || t('加载模型使用明细失败'));
          return;
        }
        setModelRows(res.data.data || []);
      } catch (error) {
        showError(error);
      } finally {
        setModelLoading(false);
      }
    },
    [endDate, startDate, t],
  );

  const refreshUsage = useCallback(
    async (mode) => {
      setRefreshing(true);
      try {
        const payload =
          mode === 'today'
            ? { mode }
            : { mode, start_date: startDate, end_date: endDate };
        const res = await API.post('/api/usage/summary/refresh', payload);
        if (!res.data.success) {
          showError(res.data.message || t('更新使用量统计失败'));
          return;
        }
        const result = res.data.data || {};
        showSuccess(
          t('更新完成') +
            `: ${result.processed_dates || 0} ${t('天')}, ${result.rows_written || 0} ${t('行')}`,
        );
        await loadUsage();
      } catch (error) {
        showError(error);
      } finally {
        setRefreshing(false);
      }
    },
    [endDate, loadUsage, startDate, t],
  );

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const res = await API.get('/api/usage/summary/export', {
        params: {
          start_date: startDate,
          end_date: endDate,
          username: username.trim() || undefined,
        },
        responseType: 'blob',
        disableDuplicate: true,
      });
      downloadBlob(res.data, `user-usage-${startDate}-${endDate}.csv`);
    } catch (error) {
      showError(error);
    } finally {
      setExporting(false);
    }
  }, [endDate, startDate, username]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const columns = [
    {
      title: t('用户'),
      dataIndex: 'username',
      render: (text, record) => (
        <Button theme='borderless' onClick={() => loadModelUsage(record)}>
          {text || `#${record.user_id}`}
        </Button>
      ),
    },
    { title: t('使用天数'), dataIndex: 'active_days' },
    {
      title: t('请求数'),
      dataIndex: 'request_count',
      render: (value) => formatNumber(value),
    },
    {
      title: t('总输入 Tokens'),
      dataIndex: 'prompt_tokens',
      render: formatTokensMillion,
    },
    {
      title: t('总输出 Tokens'),
      dataIndex: 'completion_tokens',
      render: formatTokensMillion,
    },
    {
      title: t('日均输入 Tokens'),
      dataIndex: 'avg_prompt_tokens_per_day',
      render: formatTokensMillion,
    },
    {
      title: t('日均输出 Tokens'),
      dataIndex: 'avg_completion_tokens_per_day',
      render: formatTokensMillion,
    },
    {
      title: t('总消费金额'),
      dataIndex: 'quota',
      render: (value) => renderQuota(value, 6),
    },
    {
      title: t('日均消费金额'),
      dataIndex: 'avg_quota_per_day',
      render: (value) => renderQuota(value, 6),
    },
    {
      title: t('开始时间'),
      dataIndex: 'first_date',
      render: formatUnixDate,
    },
    {
      title: t('结束时间'),
      dataIndex: 'last_date',
      render: formatUnixDate,
    },
  ];

  const modelColumns = [
    { title: t('模型'), dataIndex: 'model_name' },
    { title: t('使用天数'), dataIndex: 'active_days' },
    {
      title: t('请求数'),
      dataIndex: 'request_count',
      render: (value) => formatNumber(value),
    },
    {
      title: t('总输入 Tokens'),
      dataIndex: 'prompt_tokens',
      render: formatTokensMillion,
    },
    {
      title: t('总输出 Tokens'),
      dataIndex: 'completion_tokens',
      render: formatTokensMillion,
    },
    {
      title: t('总消费金额'),
      dataIndex: 'quota',
      render: (value) => renderQuota(value, 6),
    },
    {
      title: t('日均消费金额'),
      dataIndex: 'avg_quota_per_day',
      render: (value) => renderQuota(value, 6),
    },
  ];

  return (
    <div className='mt-[60px] px-2'>
      <Card>
        <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
          <div>
            <Title heading={4}>{t('使用量统计')}</Title>
            <Text type='secondary'>
              {t('从每日聚合表读取，不在页面查询时实时扫描日志。')}
            </Text>
          </div>
          <Space wrap>
            <Button
              loading={refreshing}
              onClick={() => refreshUsage('missing')}
            >
              {t('更新缺失日期')}
            </Button>
            <Button loading={refreshing} onClick={() => refreshUsage('today')}>
              {t('更新今日')}
            </Button>
            <Button loading={exporting} type='primary' onClick={exportCsv}>
              {t('导出 CSV')}
            </Button>
          </Space>
        </div>

        <div className='mb-4 grid grid-cols-1 gap-3 md:grid-cols-4'>
          <label className='flex flex-col gap-1 text-sm'>
            <span>{t('开始日期')}</span>
            <input
              className='semi-input semi-input-default'
              type='date'
              value={startDate}
              onChange={(event) => {
                setPage(1);
                setStartDate(event.target.value);
              }}
            />
          </label>
          <label className='flex flex-col gap-1 text-sm'>
            <span>{t('结束日期')}</span>
            <input
              className='semi-input semi-input-default'
              type='date'
              value={endDate}
              onChange={(event) => {
                setPage(1);
                setEndDate(event.target.value);
              }}
            />
          </label>
          <label className='flex flex-col gap-1 text-sm'>
            <span>{t('用户')}</span>
            <Input
              value={username}
              placeholder={t('按用户名筛选')}
              onChange={(value) => {
                setPage(1);
                setUsername(value);
              }}
            />
          </label>
          <div className='flex items-end'>
            <Button onClick={loadUsage} loading={loading}>
              {t('查询')}
            </Button>
          </div>
        </div>

        <Table
          rowKey='user_id'
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={{ x: 1500 }}
        />

        <div className='mt-4 flex justify-end'>
          <Pagination
            currentPage={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(nextPage) => setPage(nextPage)}
          />
        </div>
      </Card>

      <Modal
        title={`${t('模型使用明细')} · ${selectedUser?.username || '-'}`}
        visible={modelModalVisible}
        onCancel={() => setModelModalVisible(false)}
        footer={null}
        width={1000}
      >
        <Table
          rowKey='model_name'
          columns={modelColumns}
          dataSource={modelRows}
          loading={modelLoading}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      </Modal>
    </div>
  );
}
