# coding: utf-8

require 'jiji/configurations/mongoid_configuration'
require 'jiji/utils/value_object'
require 'jiji/errors/errors'
require 'jiji/web/transport/transportable'

module Jiji::Model::Logging
  class LogData

    include Mongoid::Document
    include Jiji::Utils::ValueObject
    include Jiji::Web::Transport::Transportable
    include Jiji::Errors

    store_in collection: 'log_data'
    belongs_to :backtest, {
      class_name: 'Jiji::Model::Trading::BackTestProperties'
    }

    field :body,          type: Array, default: []
    field :timestamp,     type: Time
    field :size,          type: Integer, default: 0

    index(
      { backtest_id: 1, timestamp: -1 },
      name: 'logdata_backtest_id_timestamp_index')

    def self.create( timestamp, body=nil, backtest=nil )
      return LogData.new do |data|
        data.backtest  = backtest
        data.timestamp = timestamp
        data << body if body
      end
    end

    def <<(data)
      self.body << data
      self.size += data.bytesize
      save if (exceed_save_limit?(data))
    end

    def full?
      size >= 500 * 1024
    end

    def to_h
      {
        body:      body.join("\n"),
        timestamp: timestamp,
        size:      size
      }
    end

    private

    def exceed_save_limit?(data)
      save_limit = 10 * 1024
      (size / save_limit).round > ((size - data.bytesize) / save_limit).round
    end

  end
end