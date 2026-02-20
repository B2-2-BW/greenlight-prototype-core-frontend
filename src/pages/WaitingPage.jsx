import { useEffect, useMemo, useRef, useState } from 'react';
import PositionPanelRenewal from '../components/PositionPanelRenewal.jsx';
import MyPosition from '../components/MyPosition.jsx';
import ApiClient from '../client/api.js';
import { GREENLIGHT_CORE_API_URL } from '../config/config.js';
import { retryable } from '../util/retry.js';
import { useParams } from 'react-router-dom';
import NotFoundPage from './NotFoundPage.jsx';
import Upcoming from '../components/Upcoming.jsx';
import '../components/WaitingPage.css';

function overwriteQueryParam(originalUrl, key, value) {
  const [urlBeforeHash] = originalUrl.split('#');
  const [basePath, queryString] = urlBeforeHash.split('?');
  const params = new URLSearchParams(queryString || '');

  params.set(key, value);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export default function WaitingPage() {
  // 랜딩 ID 파라미터
  const { landingId } = useParams();

  // 로딩 완료여부 판별
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isUpcomingOpened, setIsUpcomingOpened] = useState(false);

  // 최초 진입 시 고객데이터
  const [customerData, setCustomerData] = useState(null);
  const [currentWaitStatus, setCurrentWaitStatus] = useState(null);

  // 고객 대기열 정보
  const initialPosition = useRef(null);
  const [positionData, setPositionData] = useState(null);
  const [progress, setProgress] = useState(0);

  const mudoTempRansom = useRef(Math.random());
  // [POC용] 액션 그룹 ID에 따라 이미지 경로 반환하는 함수
  const getImageUrl = () => {
    if (customerData?.actionGroupId == null) {
      return '';
    }
    if (customerData?.actionGroupId === 6) {
      return '/resources/images/LI_sample.png';
    }
    if (customerData?.actionGroupId === 7) {
      return '/resources/images/GF_sample2.png';
    }
    // 20251209 무한도전

    // if (mudoTempRansom.current > 0.5) {
    //   return '/resources/images/251209_muhan_1.jpg';
    // } else {
    //   return '/resources/images/251209_muhan_2.png';
    // }
    return '';
  };

  // [POC용2] 액션 그룹 ID에 따른 스타일 반환 함수 추가
  const getThemeStyles = () => {
    // 특정 그룹 ID (예: 7) 일 때 색상 변경
    if (customerData?.actionGroupId === 7) {
      return {
        headerText: 'text-[#1e1e1e]', // 2. 접속 대기중이에요 텍스트 색
        positionNum: 'text-[#918C00]', // 1. 나의 대기순서 숫자 색
        boxBg: 'bg-[#f5f5f5]', // 3. 박스 배경 색
        behindNum: 'text-[#918C00]', // 4. 뒤에 기다리는 사람 숫자 색
      };
    }
    // 기본 스타일 (원래 코드의 색상값)
    return {
      headerText: '', // 기본 검정
      positionNum: 'text-[#375A4E]', // 기존 초록색
      boxBg: 'bg-[#f5f5f5]', // 기존 분홍색 배경
      behindNum: 'text-[#375A4E]', // 기존 초록색
    };
  };

  const theme = getThemeStyles(); // 스타일 객체 생성

  useEffect(() => {
    let newProgress =
      (initialPosition.current - positionData?.currentPosition) /
      initialPosition.current;
    newProgress = Math.max(0, Math.min(1.0, newProgress));
    setProgress(newProgress);
  }, [positionData]);

  const redirectUrlParam = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const val = sp.get('redirectUrl');
    if (!val) return null;
    try {
      const decoded = decodeURIComponent(val);
      // http/https만 허용 (원하면 제거 가능)
      if (/^https?:\/\//i.test(decoded)) return decoded;
      if (/^https?:\/\//i.test(val)) return val;
      return null;
    } catch {
      return /^https?:\/\//i.test(val) ? val : null;
    }
  }, [location.search]);

  /* ************************************** */

  const retryOptions = {
    retries: 5,
    baseDelay: 3000,
    maxDelay: 20000,
  };

  // 1. 최초 로딩 시 action 조회
  useEffect(() => {
    document.title = '랜딩페이지 | Greenlight';
  }, []);

  useEffect(() => {
    setIsNotFound(false);
    setIsImageLoading(true);
    setIsUpcomingOpened(false);
  }, [landingId]);

  // 2. action을 조회한 뒤 완료되면 입장요청
  useEffect(() => {
    if (landingId == null || isNotFound) {
      return;
    }
    // TODO retryable 나중에 landingId 바뀌면 문제될게 있을까??
    retryable(checkOrEnter, retryOptions).catch((reason) =>
      console.error(reason)
    );
  }, [landingId, isNotFound]);

  const onWaitingImageLoad = () => {
    setIsImageLoading(false);
  };
  const checkOrEnter = async () => {
    const body = {
      landingId: landingId, // redirectUrl이 있으면 그걸로 목적지를 덮어씀
    };
    try {
      const res = await ApiClient.post('/api/v1/queue/check-landing', body);
      // TODO data.waitStatus 가 DISABLED 일 때 
      if (res?.status === 200 && res?.data?.customerId != null) {
        const data = res.data;

        if (data.destinationUrl == null) {
          throw new Error('비정상적인 접근입니다 destinationUrl is null');
        }

        setCustomerData(data);
        setCurrentWaitStatus(data.waitStatus);
        setIsImageLoading(false);
      } else if (res?.status === 200 && res?.data?.customerId == null) {
         const data = res.data;
         setCustomerData(data);
         setCurrentWaitStatus(data.waitStatus);
         setIsImageLoading(false);
      } else {
        console.error('checkOrEnter 응답 비정상', {
          data: res?.data,
          status: res?.status,
        });
      }
    } catch (error) {
      console.log('res?.status', error?.status);
      if (error?.status === 404) {
        setIsNotFound(true);
        throw new Error('landingId not found');
      } else {
        throw error;
      }
    }
  };

  const eventSourceRef = useRef(null);
  const eventRetryTimeoutRef = useRef(null);
  const retryInterval = 5000;

  // 3. customerId가 있을때 sse 연결 시작
  useEffect(() => {
    if (customerData?.customerId == null) {
      return;
    }
    // setIsImageLoading(true);

    const cleanup = () => {
      if (eventRetryTimeoutRef.current !== null) {
        window.clearTimeout(eventRetryTimeoutRef.current);
        eventRetryTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const connect = () => {
      cleanup(); // 기존 연결/타이머 정리

      const es = new EventSource(
        GREENLIGHT_CORE_API_URL +
          `/waiting/sse?customerId=${customerData.customerId}` // useEffect 상단에서 customerId는 null이 아님을 보장
      );
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log('SSE connected');
      };

      es.onmessage = (event) => {
        if (isConnected) {
          setIsConnected(false);
        }
        const data = JSON.parse(event.data);

        if (initialPosition.current == null) {
          initialPosition.current = data.position;
        }
        setPositionData({
          currentPosition: data.position,
          estimatedWaitTime: data.estimatedWaitTime,
          behindCount: data.behindCount,
        });
        if (currentWaitStatus !== data.waitStatus) {
          setCurrentWaitStatus(data.waitStatus);
        }
      };

      es.onerror = (error) => {
        console.log('SSE 연결 재시도중'); // error는 단순 이벤트가 노출되므로 운영에서는 출력 제외
        es.close();
        // 일정 시간 후 재연결
        eventRetryTimeoutRef.current = window.setTimeout(
          connect,
          retryInterval
        );
      };
    };

    connect();

    return () => {
      cleanup();
    };
  }, [customerData]);

  // Step 4: 대기열 필요 없는 상태는 자동 이동
  useEffect(() => {
    const redirectTo = redirectUrlParam || customerData?.destinationUrl; // redirectUrl 쿼리가 있다면 우선 적용. 없을 경우 기본값 적용 (check-landing api 응답값)
    
    // 이벤트 입장 전 상태 -> Upcoming 화면 노출
    if(currentWaitStatus === 'DISABLED'){
      setIsUpcomingOpened(true);
    }

    if (redirectTo == null) {
      return;
    }
    //입장 가능 상태인경우 토큰이랑 같이 보내줌
    if (currentWaitStatus != null && currentWaitStatus !== 'WAITING') {
      const finalDestination = overwriteQueryParam(
        redirectTo,
        'gUserId',
        customerData?.customerId
      );
      console.log(`[Redirect → ${currentWaitStatus}]`, finalDestination);
      window.location.replace(finalDestination);
    }
  }, [currentWaitStatus, customerData, redirectUrlParam]);

  if (isNotFound) {
    return <NotFoundPage />;
  }
  if (isUpcomingOpened) {
    return <Upcoming landingStartAt={customerData?.landingStartAt}/>;
  }

  return (
    <>
      <div className="flex items-center justify-center h-dvh">
        <div className="m-auto w-[75%] max-w-[480px] flex flex-col items-center">
          <div className="w-full flex flex-col items-center relative">
            {/* 광고 이미지 */}
            <div className="image-wrapper">
              {isImageLoading && <div className="image-skeleton" />}
              <img
                src={getImageUrl()}
                alt=""
                className="image"
                onLoad={onWaitingImageLoad}
              />
            </div>
          </div>
          <section className="w-full flex flex-col items-center mt-5 mb-3">
            {/* 그린푸드 poc */}
            <h1
              className={`text-lg sm:text-xl md:text-2xl font-semibold text-center ${theme.headerText}`}
            >
              {/* <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-center"> */}
              사용자가 많아 접속 대기중이에요
            </h1>
          </section>
          {/* 그린푸드 poc */}
          <MyPosition
            position={positionData?.currentPosition}
            isLoading={isConnected}
            progress={progress}
            numColor={theme.positionNum}
          />
          <PositionPanelRenewal
            isLoading={isConnected}
            behindCount={positionData?.behindCount}
            estimatedWaitTime={positionData?.estimatedWaitTime}
            boxColor={theme.boxBg}
            numColor={theme.behindNum}
          />
          {/* 
          <MyPosition
            position={currentPosition}
            isLoading={isLoading}
            progress={progress}
          />

          <PositionPanelRenewal
            isLoading={isLoading}
            behindCount={behindCount}
            estimatedWaitTime={estimatedWaitTime}
          />
           */}
          <section className="flex flex-col items-center text-neutral-500 mb-5 text-xs">
            <p className="whitespace-nowrap">
              잠시만 기다리시면 순서에 따라 자동 접속됩니다.
            </p>
            <p>새로고침하면 대기시간이 길어질 수 있어요</p>
          </section>
          <section className="flex flex-col items-center">
            {/*<button className="rounded-full text-neutral-700 border-[1px] border-neutral-200 px-2 py-2">*/}
            {/*  이전으로 돌아가기*/}
            {/*</button>*/}
          </section>
        </div>
      </div>
    </>
  );
}
