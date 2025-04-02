import * as React from 'react';

import * as styles from './LoadableErrorBoundary.module.css';
import { Button } from '../Button';

// TODO заменить на нормальный logger
interface ILogger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(...args: any): void;
}

interface ILoadableErrorBoundaryProps {
  logger: ILogger;
  onRetry(): void;
}

interface ILoadableErrorBoundaryState {
  hasError: boolean;
}

export class LoadableErrorBoundary extends React.Component<
  React.PropsWithChildren<ILoadableErrorBoundaryProps>,
  ILoadableErrorBoundaryState
> {
  public state: ILoadableErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): ILoadableErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.logger.error(error, { ...info });
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles['container']}>
          <p className={styles['text']}>
            Во время загрузки произошла ошибка. Пожалуйста, проверьте своё интернет соединение и попробуйте ещё раз.
          </p>
          <Button onClick={this.handleRetryClick}>Повторить</Button>
        </div>
      );
    }

    return this.props.children;
  }

  private handleRetryClick = (): void => {
    this.props.onRetry();

    this.setState({
      hasError: false,
    });
  };
}
