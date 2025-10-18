import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PerformanceDataPoint {
  time: string;
  [key: string]: string | number;
}

interface Model {
  id: number;
  name: string;
  currentBalance: number;
  color: string;
  icon: string;
}

export const LivePerformanceChart: React.FC<{ models: Model[] }> = ({ models }) => {
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([]);

  useEffect(() => {
    // Initialize with current data
    const initialDataPoint: PerformanceDataPoint = {
      time: new Date().toLocaleTimeString(),
    };
    
    models.forEach(model => {
      initialDataPoint[model.name] = model.currentBalance;
    });
    
    setPerformanceData([initialDataPoint]);

    // Add new data points every 10 seconds
    const interval = setInterval(() => {
      setPerformanceData(prevData => {
        const newDataPoint: PerformanceDataPoint = {
          time: new Date().toLocaleTimeString(),
        };
        
        models.forEach(model => {
          newDataPoint[model.name] = model.currentBalance;
        });
        
        // Keep only last 20 data points for performance
        const newData = [...prevData, newDataPoint];
        return newData.slice(-20);
      });
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [models]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-white font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: ${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Live Performance Chart</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-green-400">LIVE</span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={performanceData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="time" 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            domain={['dataMin - 100', 'dataMax + 100']}
            tickFormatter={(value) => `$${value.toLocaleString()}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: '#fff' }}
            iconType="line"
          />
          {models.slice(0, 6).map((model) => (
            <Line
              key={model.id}
              type="monotone"
              dataKey={model.name}
              stroke={model.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      
      <div className="mt-4 text-xs text-gray-500 text-center">
        Chart updates every 10 seconds with live model performance data
      </div>
    </div>
  );
};

export default LivePerformanceChart;
